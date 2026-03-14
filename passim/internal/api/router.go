package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/speedtest"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
)

type Deps struct {
	DB        *sql.DB
	JWT       *auth.JWTManager
	WebAuthn  *auth.WebAuthnManager
	Docker    docker.DockerClient
	Templates *template.Registry
	SSL       *ssl.SSLManager
	Iperf     *speedtest.IperfServer
	Tasks     *task.Queue
	SSE       *sse.Broker
}

func NewRouter(deps Deps) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(gin.Logger())

	ah := &authHandler{database: deps.DB, jwt: deps.JWT}

	api := r.Group("/api")
	{
		// Public — no auth required
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/login", ah.login)
			authGroup.POST("/refresh", ah.refresh)

			// Public passkey routes (no auth required)
			if deps.WebAuthn != nil {
				ph := &passkeyHandler{database: deps.DB, jwt: deps.JWT, webauthn: deps.WebAuthn}
				authGroup.POST("/passkey/begin", ph.beginLogin)
				authGroup.POST("/passkey/finish", ph.finishLogin)
				authGroup.GET("/passkeys/exists", ph.passkeyExists)
			}
		}

		// Public speedtest routes (no auth)
		registerSpeedtestPublicRoutes(api)

		// Protected — JWT required
		protected := api.Group("")
		protected.Use(authMiddleware(deps.JWT, deps.DB))
		{
			// Protected passkey management routes
			if deps.WebAuthn != nil {
				ph := &passkeyHandler{database: deps.DB, jwt: deps.JWT, webauthn: deps.WebAuthn}
				protected.POST("/auth/passkey/register", ph.beginRegister)
				protected.POST("/auth/passkey/register/finish", ph.finishRegister)
				protected.GET("/auth/passkeys", ph.listPasskeys)
				protected.DELETE("/auth/passkeys/:id", ph.deletePasskey)
			}

			protected.GET("/status", statusHandler(deps))

			if deps.Templates != nil {
				protected.GET("/templates", listTemplates(deps.Templates))
			}

			// Container routes
			protected.GET("/containers", listContainersHandler(deps))
			protected.POST("/containers/:id/start", startContainerHandler(deps))
			protected.POST("/containers/:id/stop", stopContainerHandler(deps))
			protected.POST("/containers/:id/restart", restartContainerHandler(deps))
			protected.DELETE("/containers/:id", removeContainerHandler(deps))
			protected.GET("/containers/:id/logs", containerLogsHandler(deps))

			// App routes
			protected.POST("/apps", deployAppHandler(deps))
			protected.GET("/apps", listAppsHandler(deps))
			protected.GET("/apps/:id", getAppHandler(deps))
			protected.PATCH("/apps/:id", updateAppHandler(deps))
			protected.DELETE("/apps/:id", deleteAppHandler(deps))
			protected.GET("/apps/:id/configs", appConfigsHandler(deps))
			protected.GET("/apps/:id/configs/:file", appConfigFileHandler(deps))

			// Task routes
			protected.GET("/tasks", listTasksHandler(deps))
			protected.GET("/tasks/:id", getTaskHandler(deps))
			protected.GET("/tasks/:id/events", taskEventsHandler(deps))

			// App events
			protected.GET("/apps/:id/events", appEventsHandler(deps))

			// Metrics stream
			protected.GET("/metrics/stream", metricsStreamHandler(deps))

			// SSL routes
			if deps.SSL != nil {
				registerSSLRoutes(protected, deps.SSL)
			}

			// Protected speedtest routes
			if deps.Iperf != nil {
				registerSpeedtestProtectedRoutes(protected, deps.Iperf)
			}
		}
	}

	return r
}
