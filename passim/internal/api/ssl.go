package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/ssl"
)

func registerSSLRoutes(group *gin.RouterGroup, mgr *ssl.SSLManager) {
	s := group.Group("/ssl")
	{
		s.GET("/status", sslStatusHandler(mgr))
		s.POST("/renew", sslRenewHandler(mgr))
		s.POST("/upload", sslUploadHandler())
	}
}

func sslStatusHandler(mgr *ssl.SSLManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := mgr.Status()
		c.JSON(http.StatusOK, status)
	}
}

func sslRenewHandler(mgr *ssl.SSLManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := mgr.Status()
		if status.Mode == "auto" {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "auto renewal not yet implemented"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "renewal not applicable for " + status.Mode + " mode"})
	}
}

func sslUploadHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "custom certificate upload not yet implemented"})
	}
}
