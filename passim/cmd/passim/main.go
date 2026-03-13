package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/passim/passim/internal/api"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/setup"
)

func main() {
	database, err := db.Open("/data/passim.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// First-time setup: generate node_id, API Key, JWT secret
	if err := setup.Init(database); err != nil {
		log.Fatalf("failed to initialise: %v", err)
	}

	// Load JWT secret from DB
	jwtSecret, err := db.GetConfig(database, "jwt_secret")
	if err != nil || jwtSecret == "" {
		log.Fatal("jwt_secret not found in config")
	}
	jwtMgr := auth.NewJWTManager(jwtSecret, 7*24*time.Hour)

	router := api.NewRouter(api.Deps{
		DB:  database,
		JWT: jwtMgr,
	})

	addr := ":8443"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}

	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("passim listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("bye")
}
