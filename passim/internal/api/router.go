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
	"github.com/passim/passim/internal/update"
	"github.com/passim/passim/internal/version"
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
	SSE        *sse.Broker
	NodeHub    NodeHub
	DataDir      string
	DataVolume   string // Docker named volume for DataDir (auto-discovered)
	DataHostPath string // Host bind-mount source for DataDir (auto-discovered)
	Checker    *update.Checker
	Updater    *update.Updater
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
		api.GET("/version", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"version":    version.Version,
				"commit":     version.Commit,
				"build_time": version.BuildTime,
			})
		})

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

		// Public share routes (no auth)
		shareGroup := api.Group("/s")
		{
			shareGroup.GET("/:token", shareConfigHandler(deps))
			shareGroup.GET("/:token/subscribe", shareSubscribeHandler(deps))
			shareGroup.GET("/:token/file/:index", shareFileHandler(deps))
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
			protected.GET("/settings", getSettingsHandler(deps))
			protected.PATCH("/settings", updateSettingsHandler(deps))

			if deps.Templates != nil {
				protected.GET("/templates/:name", getTemplateHandler(deps))
				protected.GET("/templates", listTemplates(deps.Templates))
			}

			// Container routes
			protected.GET("/containers", listContainersHandler(deps))
			protected.POST("/containers/:id/start", startContainerHandler(deps))
			protected.POST("/containers/:id/stop", stopContainerHandler(deps))
			protected.POST("/containers/:id/restart", restartContainerHandler(deps))
			protected.DELETE("/containers/:id", removeContainerHandler(deps))
			protected.GET("/containers/:id/logs", containerLogsHandler(deps))
			protected.GET("/containers/:id/terminal", containerTerminalHandler(deps))

			// App routes
			protected.POST("/apps", deployAppHandler(deps))
			protected.GET("/apps", listAppsHandler(deps))
			protected.GET("/apps/:id", getAppHandler(deps))
			protected.PATCH("/apps/:id", updateAppHandler(deps))
			protected.DELETE("/apps/:id", deleteAppHandler(deps))
			protected.GET("/apps/:id/configs", appConfigsHandler(deps))
			protected.GET("/apps/:id/configs/*filepath", appConfigFileHandler(deps))
			protected.GET("/apps/:id/client-config", appClientConfigHandler(deps))
			protected.GET("/apps/:id/client-config/file/:index", appClientConfigFileHandler(deps))
			protected.GET("/apps/:id/client-config/zip", appClientConfigZIPHandler(deps))
			protected.GET("/apps/:id/subscribe", appSubscribeHandler(deps))
			protected.POST("/apps/:id/share", createShareHandler(deps))
			protected.DELETE("/apps/:id/share", revokeShareHandler(deps))

			// Task routes
			protected.GET("/tasks", listTasksHandler(deps))
			protected.GET("/tasks/:id", getTaskHandler(deps))
			protected.GET("/tasks/:id/events", taskEventsHandler(deps))

			// App events
			protected.GET("/apps/:id/events", appEventsHandler(deps))

			// Metrics stream (legacy — kept for backward compat)
			protected.GET("/metrics/stream", metricsStreamHandler(deps))

			// Unified SSE stream (replaces metrics/stream + polling)
			protected.GET("/stream", unifiedStreamHandler(deps))

			// Node management
			protected.POST("/nodes", addNodeHandler(deps))
			protected.GET("/nodes", listNodesHandler(deps))
			protected.DELETE("/nodes/:id", deleteNodeHandler(deps))
			protected.PATCH("/nodes/:id", updateNodeHandler(deps))

			// Node proxy routes
			protected.GET("/nodes/:id/status", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/status" }))
			protected.GET("/nodes/:id/containers", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/containers" }))
			protected.GET("/nodes/:id/apps", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/apps" }))
			protected.GET("/nodes/:id/templates", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/templates" }))
			protected.POST("/nodes/:id/apps", nodeProxyHandler(deps, "POST", func(c *gin.Context) string { return "/api/apps" }))
			protected.DELETE("/nodes/:id/apps/:appId", nodeProxyHandler(deps, "DELETE", func(c *gin.Context) string { return "/api/apps/" + c.Param("appId") }))
			protected.GET("/nodes/:id/apps/:appId/configs", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/apps/" + c.Param("appId") + "/configs" }))
			protected.GET("/nodes/:id/apps/:appId/client-config", nodeProxyHandler(deps, "GET", func(c *gin.Context) string { return "/api/apps/" + c.Param("appId") + "/client-config" }))

			// Node update proxy routes
			protected.GET("/nodes/:id/version/check", nodeProxyHandler(deps, "GET", func(c *gin.Context) string {
				qs := c.Request.URL.RawQuery
				if qs != "" {
					return "/api/version/check?" + qs
				}
				return "/api/version/check"
			}))
			protected.POST("/nodes/:id/update", nodeProxyHandler(deps, "POST", func(c *gin.Context) string { return "/api/update" }))

			// Node server-side speed test (local → remote, no browser middleman)
			protected.POST("/nodes/:id/speedtest", nodeSpeedtestHandler(deps))

			// Batch deploy
			protected.POST("/batch/deploy", batchDeployHandler(deps))

			// Connections
			protected.GET("/connections", listConnectionsHandler(deps))
			protected.DELETE("/connections/:id", disconnectHandler(deps))

			// S3 credentials
			protected.GET("/s3", listS3Handler(deps))
			protected.POST("/s3", createS3Handler(deps))
			protected.PUT("/s3/:id", updateS3Handler(deps))
			protected.DELETE("/s3/:id", deleteS3Handler(deps))
			protected.POST("/s3/:id/test", testS3Handler(deps))

			// SSL routes
			if deps.SSL != nil {
				registerSSLRoutes(protected, deps.SSL)
			}

			// Update routes
			if deps.Checker != nil {
				protected.GET("/version/check", versionCheckHandler(deps.Checker))
			}
			if deps.Updater != nil {
				protected.POST("/update", updateHandler(deps.Updater))
			}

			// Protected speedtest routes
			registerSpeedtestProtectedRoutes(protected, deps.Iperf)
		}
	}

	return r
}
