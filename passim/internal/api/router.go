package api

import (
	"database/sql"
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

type Deps struct {
	DB        *sql.DB
	JWT       *auth.JWTManager
	Docker    docker.DockerClient
	Templates *template.Registry
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

		// Protected — JWT required
		protected := api.Group("")
		protected.Use(authMiddleware(deps.JWT, deps.DB))
		{
			protected.GET("/status", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{
					"status":  "ok",
					"version": "0.1.0",
					"go":      runtime.Version(),
				})
			})

			if deps.Templates != nil {
				protected.GET("/templates", listTemplates(deps.Templates))
			}
		}
	}

	return r
}
