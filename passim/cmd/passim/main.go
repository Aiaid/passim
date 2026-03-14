package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/api"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/setup"
	"github.com/passim/passim/internal/speedtest"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
)

//go:embed all:dist
var webDist embed.FS

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

	// Docker client
	dockerClient, err := docker.NewClient()
	if err != nil {
		log.Printf("warning: docker not available: %v", err)
	}

	// Template registry
	registry := template.NewRegistry()
	if err := registry.LoadDir("/etc/passim/templates"); err != nil {
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
			DataDir:    "/data",
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

	// Iperf server
	iperfSrv := speedtest.NewIperfServer("5201")
	if err := iperfSrv.Start(); err != nil {
		log.Printf("warning: iperf3 server failed to start: %v", err)
	} else {
		defer iperfSrv.Stop()
	}

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

	deps := api.Deps{
		DB:        database,
		JWT:       jwtMgr,
		WebAuthn:  webauthnMgr,
		Docker:    dockerClient,
		Templates: registry,
		SSL:       sslMgr,
		Iperf:     iperfSrv,
		Tasks:     taskQueue,
		SSE:       sseBroker,
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
