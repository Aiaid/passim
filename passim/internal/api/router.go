package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/speedtest"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/template"
)

type Deps struct {
	DB        *sql.DB
	JWT       *auth.JWTManager
	Docker    docker.DockerClient
	Templates *template.Registry
	SSL       *ssl.SSLManager
	Iperf     *speedtest.IperfServer
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
		}

		// Public speedtest routes (no auth)
		registerSpeedtestPublicRoutes(api)

		// Protected — JWT required
		protected := api.Group("")
		protected.Use(authMiddleware(deps.JWT, deps.DB))
		{
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
