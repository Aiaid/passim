package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/api"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/node"
	"github.com/passim/passim/internal/setup"
	"github.com/passim/passim/internal/speedtest"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
	"github.com/passim/passim/internal/version"
)

//go:embed all:dist
var webDist embed.FS

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("passim %s (%s) built %s\n", version.Version, version.Commit, version.BuildTime)
		os.Exit(0)
	}

	dataDir := getEnvDefault("DATA_DIR", "/data")
	templateDir := getEnvDefault("TEMPLATE_DIR", "/etc/passim/templates")

	database, err := db.Open(filepath.Join(dataDir, "passim.db"))
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

	// Docker client
	dockerClient, err := docker.NewClient()
	if err != nil {
		log.Printf("warning: docker not available: %v", err)
	}

	// Template registry
	registry := template.NewRegistry()
	if err := registry.LoadDir(templateDir); err != nil {
		log.Printf("warning: failed to load templates: %v", err)
	}

	// SSL configuration — SSL_MODE=off disables TLS entirely (dev mode)
	sslMode := getEnvDefault("SSL_MODE", "self-signed")
	sslDomain := os.Getenv("SSL_DOMAIN")
	sslBaseDomain := os.Getenv("DNS_BASE_DOMAIN") // DNS reflector (e.g., "dns.passim.io")
	sslEmail := os.Getenv("SSL_EMAIL")

	var sslMgr *ssl.SSLManager
	if sslMode != "off" {
		sslMgr = ssl.NewSSLManager(ssl.SSLManagerConfig{
			Mode:       sslMode,
			DataDir:    dataDir,
			Domain:     sslDomain,
			BaseDomain: sslBaseDomain,
			Email:      sslEmail,
		})
		if err := sslMgr.Init(); err != nil {
			log.Printf("warning: SSL init failed: %v", err)
		}
	}

	// Task queue
	taskQueue := task.NewQueue(database, 100)
	taskQueue.Start(2)

	// SSE broker
	sseBroker := sse.NewBroker()

	// Iperf server (default off — start via API toggle)
	iperfSrv := speedtest.NewIperfServer("5201")
	defer iperfSrv.Stop()

	// WebAuthn manager
	rpID := "localhost"
	scheme := "https"
	if sslMode == "off" {
		scheme = "http"
	}
	rpOrigin := scheme + "://localhost:8443"
	if sslDomain != "" {
		rpID = sslDomain
		rpOrigin = scheme + "://" + sslDomain
	}
	if port := os.Getenv("PORT"); port != "" && sslDomain == "" {
		rpOrigin = scheme + "://localhost:" + port
	}
	webauthnMgr, err := auth.NewWebAuthnManager(rpID, rpOrigin)
	if err != nil {
		log.Printf("warning: WebAuthn init failed: %v", err)
	}

	// Auto-discover Docker volume backing dataDir (for Docker-in-Docker deploys)
	dataVolume := os.Getenv("DATA_VOLUME") // explicit override
	if dataVolume == "" && dockerClient != nil {
		dataVolume = discoverDataVolume(dockerClient, dataDir)
		if dataVolume != "" {
			log.Printf("auto-discovered data volume: %s", dataVolume)
		}
	}

	// Initialize Node Hub for remote node management
	nodeHub := node.NewHub(database, sseBroker)
	nodeHub.Start(context.Background())
	defer nodeHub.Stop()

	deps := api.Deps{
		DB:         database,
		JWT:        jwtMgr,
		WebAuthn:   webauthnMgr,
		Docker:     dockerClient,
		Templates:  registry,
		SSL:        sslMgr,
		Iperf:      iperfSrv,
		Tasks:      taskQueue,
		SSE:        sseBroker,
		NodeHub:    nodeHub,
		DataDir:    dataDir,
		DataVolume: dataVolume,
	}

	// Register task handlers (deploy/undeploy) — after deps assembled
	api.RegisterTaskHandlers(taskQueue, deps)

	router := api.NewRouter(deps)

	// Serve embedded web UI
	webFS, err := fs.Sub(webDist, "dist")
	if err != nil {
		log.Fatalf("failed to access embedded web files: %v", err)
	}
	api.ServeStatic(router.(*gin.Engine), webFS)

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
		if sslMode == "off" {
			log.Printf("passim listening on %s (HTTP — dev mode)", addr)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("server error: %v", err)
			}
			return
		}

		tlsConfig, tlsErr := sslMgr.GetTLSConfig()
		if tlsErr != nil {
			log.Printf("warning: TLS not available (%v), serving HTTP only", tlsErr)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("server error: %v", err)
			}
		} else {
			srv.TLSConfig = tlsConfig
			log.Printf("passim listening on %s (HTTPS)", addr)
			if err := srv.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
				log.Fatalf("server error: %v", err)
			}
		}
	}()

	// HTTP server on port 80: ACME challenges + redirect to HTTPS (skip in dev mode)
	if sslMode != "off" {
		go func() {
			httpSrv := &http.Server{
				Addr:    ":80",
				Handler: sslMgr.HTTPChallengeHandler(),
			}
			if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("HTTP server (:80) error: %v (ACME challenges may not work)", err)
			}
		}()
	}

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

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// discoverDataVolume inspects the current container to find the Docker named
// volume mounted at dataDir. Returns empty string if not running in Docker
// or no volume is found.
func discoverDataVolume(dockerClient docker.DockerClient, dataDir string) string {
	hostname, err := os.Hostname()
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	info, err := dockerClient.InspectContainer(ctx, hostname)
	if err != nil {
		return "" // not in Docker or can't inspect self
	}
	for _, m := range info.Mounts {
		if m.Destination == dataDir && string(m.Type) == "volume" {
			return m.Name
		}
	}
	return ""
}
