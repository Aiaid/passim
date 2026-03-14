package api

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/ssl"
)

func registerSSLRoutes(group *gin.RouterGroup, mgr *ssl.SSLManager) {
	s := group.Group("/ssl")
	{
		s.GET("/status", sslStatusHandler(mgr))
		s.POST("/renew", sslRenewHandler(mgr))
		s.POST("/upload", sslUploadHandler(mgr))
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
		if mgr.GetMode() != "auto" {
			c.JSON(http.StatusOK, gin.H{"message": "renewal not applicable for " + mgr.GetMode() + " mode"})
			return
		}
		if err := mgr.Renew(c.Request.Context()); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "certificate renewal triggered"})
	}
}

func sslUploadHandler(mgr *ssl.SSLManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		certHeader, err := c.FormFile("cert")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cert file required"})
			return
		}
		keyHeader, err := c.FormFile("key")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "key file required"})
			return
		}

		certFile, err := certHeader.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read cert file"})
			return
		}
		defer certFile.Close()

		keyFile, err := keyHeader.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read key file"})
			return
		}
		defer keyFile.Close()

		certData, err := io.ReadAll(certFile)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read cert data"})
			return
		}
		keyData, err := io.ReadAll(keyFile)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read key data"})
			return
		}

		if err := mgr.SetCustomCert(certData, keyData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "certificate uploaded successfully"})
	}
}
