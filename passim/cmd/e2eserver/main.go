package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/docker/docker/api/types/container"
	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/api"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
)

func main() {
	// Create temp directory for data
	tmpDir, err := os.MkdirTemp("", "passim-e2e-*")
	if err != nil {
		log.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	os.Setenv("DATA_DIR", tmpDir)

	// Open SQLite database in temp directory
	database, err := db.Open(filepath.Join(tmpDir, "passim.db"))
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.Migrate(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Generate API key
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		log.Fatalf("failed to generate API key: %v", err)
	}
	if err := db.SetConfig(database, "api_key_hash", hash); err != nil {
		log.Fatalf("failed to store API key hash: %v", err)
	}

	// Generate JWT secret and create manager
	jwtSecret, err := auth.GenerateSecret()
	if err != nil {
		log.Fatalf("failed to generate JWT secret: %v", err)
	}
	if err := db.SetConfig(database, "jwt_secret", jwtSecret); err != nil {
		log.Fatalf("failed to store JWT secret: %v", err)
	}
	if err := db.SetConfig(database, "auth_version", "1"); err != nil {
		log.Fatalf("failed to store auth_version: %v", err)
	}

	jwtMgr := auth.NewJWTManager(jwtSecret, 7*24*time.Hour)

	// MockDocker with pre-filled containers
	mock := &docker.MockClient{
		Containers: []container.Summary{
			{ID: "nginx-001", Names: []string{"/passim-nginx-test0001"}, Image: "nginx:latest", State: "running", Status: "Up 2 hours"},
			{ID: "redis-002", Names: []string{"/passim-redis-test0002"}, Image: "redis:latest", State: "exited", Status: "Exited (0) 1 hour ago"},
			{ID: "postgres-003", Names: []string{"/passim-postgres-test003"}, Image: "postgres:latest", State: "running", Status: "Up 5 hours"},
		},
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "new-container-id",
	}

	// Template registry — load from relative path to passim/templates/
	registry := template.NewRegistry()
	// Try multiple paths to find templates directory
	templatePaths := []string{
		filepath.Join(".", "templates"),
		filepath.Join("..", "templates"),
		filepath.Join("..", "..", "templates"),
	}
	for _, tp := range templatePaths {
		if err := registry.LoadDir(tp); err == nil {
			break
		}
	}

	// Task queue
	taskQueue := task.NewQueue(database, 100)

	// SSE broker
	sseBroker := sse.NewBroker()

	deps := api.Deps{
		DB:        database,
		JWT:       jwtMgr,
		WebAuthn:  nil,
		Docker:    mock,
		Templates: registry,
		SSL:       nil,
		Iperf:     nil,
		Tasks:     taskQueue,
		SSE:       sseBroker,
	}

	// Register deploy/undeploy task handlers
	api.RegisterTaskHandlers(taskQueue, deps)

	// Start task queue with 1 worker
	taskQueue.Start(1)

	// Create router
	router := api.NewRouter(deps)

	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = "9876"
	}

	// Output server info as JSON to stdout (first line)
	info := map[string]interface{}{
		"port":    port,
		"api_key": plain,
	}
	infoJSON, _ := json.Marshal(info)
	fmt.Println(string(infoJSON))

	// Start HTTP server
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("e2e server listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down e2e server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	taskQueue.Stop()
	log.Println("e2e server stopped")
}
