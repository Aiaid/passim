package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ServeStatic configures SPA fallback for the embedded web UI.
// All non-/api paths serve static files from webFS, falling back to index.html.
func ServeStatic(r *gin.Engine, webFS fs.FS) {
	// Serve static assets
	fileServer := http.FileServer(http.FS(webFS))

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// API routes return 404 JSON
		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}

		// Try to serve the file directly
		if f, err := webFS.Open(strings.TrimPrefix(path, "/")); err == nil {
			f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// SPA fallback: serve index.html for client-side routing
		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
