package main

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
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
	"github.com/passim/passim/internal/update"
	"github.com/passim/passim/internal/version"
)

//go:embed all:dist
var webDist embed.FS

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version", "-v":
			fmt.Printf("passim %s (%s) built %s\n", version.Version, version.Commit, version.BuildTime)
			os.Exit(0)
		case "update-exec":
			runUpdateExec(os.Args[2:])
			os.Exit(0)
		case "reset-api-key":
			runResetAPIKey()
			os.Exit(0)
		}
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

	// Export SSL cert to shared directory for child containers
	if sslMgr != nil {
		if _, err := sslMgr.ExportToShared(); err != nil {
			log.Printf("warning: SSL cert export: %v (will retry after server starts)", err)
		}
		// Periodic re-export (catches autocert lazy init + renewals)
		go func() {
			// Retry soon after startup — autocert obtains cert on first TLS handshake
			time.Sleep(15 * time.Second)
			if changed, err := sslMgr.ExportToShared(); err == nil && changed && dockerClient != nil {
				restartTLSApps(database, dockerClient, dataDir)
			}

			ticker := time.NewTicker(1 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				changed, err := sslMgr.ExportToShared()
				if err != nil {
					log.Printf("cert sync: export failed: %v", err)
					continue
				}
				if changed && dockerClient != nil {
					restartTLSApps(database, dockerClient, dataDir)
				}
			}
		}()
	}

	// Task queue
	taskQueue := task.NewQueue(database, 100)
	taskQueue.Start(2)

	// SSE broker
	sseBroker := sse.NewBroker()

	// Iperf server (default off — start via API toggle)
	iperfSrv := speedtest.NewIperfServer("5201")
	defer iperfSrv.Stop()

	// WebAuthn manager — rpID/rpOrigin must match the domain the browser sees.
	// Priority: SSL_DOMAIN > sslMgr.GetDomain() (DNS reflector) > localhost
	rpID := "localhost"
	scheme := "https"
	if sslMode == "off" {
		scheme = "http"
	}
	port := getEnvDefault("PORT", "8443")
	rpOrigin := scheme + "://localhost:" + port
	if sslDomain != "" {
		rpID = sslDomain
		rpOrigin = scheme + "://" + sslDomain
	} else if sslMgr != nil && sslMgr.GetDomain() != "" {
		rpID = sslMgr.GetDomain()
		rpOrigin = scheme + "://" + sslMgr.GetDomain()
	}
	webauthnMgr, err := auth.NewWebAuthnManager(rpID, rpOrigin)
	if err != nil {
		log.Printf("warning: WebAuthn init failed: %v", err)
	}
	log.Printf("webauthn: rpID=%s rpOrigin=%s", rpID, rpOrigin)

	// Auto-discover Docker volume/bind mount backing dataDir (for Docker-in-Docker deploys)
	dataVolume := os.Getenv("DATA_VOLUME") // explicit override
	var dataHostPath string
	if dataVolume == "" && dockerClient != nil {
		dataVolume, dataHostPath = discoverDataMount(dockerClient, dataDir)
		if dataVolume != "" {
			log.Printf("auto-discovered data volume: %s", dataVolume)
		} else if dataHostPath != "" {
			log.Printf("auto-discovered data host path: %s (bind mount mode)", dataHostPath)
		}
	}

	// Initialize Node Hub for remote node management
	nodeHub := node.NewHub(database, sseBroker)
	nodeHub.Start(context.Background())
	defer nodeHub.Stop()

	// Update checker + updater
	githubRepo := getEnvDefault("GITHUB_REPO", "aiaid/passim")
	imageName := getEnvDefault("IMAGE_NAME", "ghcr.io/aiaid/passim")
	checker := update.NewChecker(githubRepo)
	var updater *update.Updater
	if dockerClient != nil {
		updater = update.NewUpdater(dockerClient, imageName)
	}

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
		DataDir:      dataDir,
		DataVolume:   dataVolume,
		DataHostPath: dataHostPath,
		Checker:    checker,
		Updater:    updater,
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

	// HTTP server on port 80: ACME challenges + health check + redirect to HTTPS (skip in dev mode)
	if sslMode != "off" {
		go func() {
			acmeHandler := sslMgr.HTTPChallengeHandler()
			mux := http.NewServeMux()
			mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("ok"))
			})
			mux.Handle("/", acmeHandler)
			httpSrv := &http.Server{
				Addr:    ":80",
				Handler: mux,
			}
			if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("HTTP server (:80) error: %v (ACME challenges may not work)", err)
			}
		}()
	}

	// Start background update checker (every 24h)
	updateCtx, updateCancel := context.WithCancel(context.Background())
	defer updateCancel()
	checker.StartBackground(updateCtx, 24*time.Hour)

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

// runUpdateExec handles the "passim update-exec" subcommand.
// This runs inside the helper container to orchestrate the container switch.
func runUpdateExec(args []string) {
	var targetID, name, config string

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--target="):
			targetID = strings.TrimPrefix(arg, "--target=")
		case strings.HasPrefix(arg, "--name="):
			name = strings.TrimPrefix(arg, "--name=")
		case strings.HasPrefix(arg, "--config="):
			config = strings.TrimPrefix(arg, "--config=")
		}
	}

	if targetID == "" || name == "" || config == "" {
		log.Fatal("update-exec: --target, --name, and --config are required")
	}

	dockerClient, err := docker.NewClient()
	if err != nil {
		log.Fatalf("update-exec: docker client: %v", err)
	}
	defer dockerClient.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := update.ExecSwitch(ctx, dockerClient, targetID, name, config); err != nil {
		log.Fatalf("update-exec: %v", err)
	}

	log.Println("update-exec: switch completed successfully")
}

// runResetAPIKey regenerates the API key and prints the new one.
// Usage: passim reset-api-key [NEW_KEY]
func runResetAPIKey() {
	dataDir := getEnvDefault("DATA_DIR", "/data")
	database, err := db.Open(filepath.Join(dataDir, "passim.db"))
	if err != nil {
		log.Fatalf("reset-api-key: %v", err)
	}
	defer database.Close()

	var plain string
	if len(os.Args) > 2 {
		plain = os.Args[2]
	} else {
		var err error
		plain, _, err = auth.GenerateAPIKey()
		if err != nil {
			log.Fatalf("reset-api-key: generate key: %v", err)
		}
	}

	hash := auth.HashAPIKey(plain)
	if err := db.SetConfig(database, "api_key_hash", hash); err != nil {
		log.Fatalf("reset-api-key: %v", err)
	}

	// Bump auth_version to invalidate all existing JWTs
	if v, _ := db.GetConfig(database, "auth_version"); v != "" {
		n := 1
		fmt.Sscanf(v, "%d", &n)
		db.SetConfig(database, "auth_version", fmt.Sprintf("%d", n+1))
	}

	fmt.Printf("API key reset to: %s\n", plain)
	fmt.Println("Restart the container for changes to take effect.")
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// restartTLSApps restarts containers that have TLS cert files, after cert renewal.
func restartTLSApps(database *sql.DB, dockerClient docker.DockerClient, dataDir string) {
	apps, err := db.ListApps(database)
	if err != nil {
		log.Printf("cert sync: list apps: %v", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, app := range apps {
		if app.ContainerID == "" || app.Status != "running" {
			continue
		}
		// Check if this app mounts the shared cert dir (has server.crt in config)
		appDir := filepath.Join(dataDir, "apps", app.Template+"-"+app.ID[:8], "configs")
		if _, err := os.Stat(filepath.Join(appDir, "server.crt")); err != nil {
			continue
		}
		if err := dockerClient.RestartContainer(ctx, app.ContainerID); err != nil {
			log.Printf("cert sync: restart %s-%s: %v", app.Template, app.ID[:8], err)
		} else {
			log.Printf("cert sync: restarted %s-%s after cert renewal", app.Template, app.ID[:8])
		}
	}
}

// discoverDataMount inspects the current container to find how dataDir is mounted.
// Returns (volumeName, "") for named volumes, or ("", hostPath) for bind mounts.
// Returns ("", "") if not running in Docker or no mount is found.
func discoverDataMount(dockerClient docker.DockerClient, dataDir string) (string, string) {
	hostname, err := os.Hostname()
	if err != nil {
		return "", ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	info, err := dockerClient.InspectContainer(ctx, hostname)
	if err != nil {
		return "", "" // not in Docker or can't inspect self
	}
	for _, m := range info.Mounts {
		if m.Destination == dataDir {
			if string(m.Type) == "volume" {
				return m.Name, ""
			}
			if string(m.Type) == "bind" {
				return "", m.Source
			}
		}
	}
	return "", ""
}
