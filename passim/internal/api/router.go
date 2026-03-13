package api

import (
	"database/sql"
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
)

func NewRouter(database *sql.DB) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(gin.Logger())

	api := r.Group("/api")
	{
		api.GET("/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":  "ok",
				"version": "0.1.0",
				"go":      runtime.Version(),
			})
		})
	}

	return r
}
