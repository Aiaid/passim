package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ServeStatic configures SPA fallback for the embedded web UI.
// All non-/api paths serve static files from webFS, falling back to index.html.
//
// Cache policy (important for upgrades): embed.FS reports zero ModTime, so
// http.FileServer emits no Last-Modified / ETag / Cache-Control headers and
// browsers fall back to heuristic caching. Left alone, a user who loaded the
// old index.html before upgrading would keep seeing it — and keep loading the
// old content-hashed JS/CSS bundle it points at — for hours or longer. We
// split the policy instead:
//
//   - /assets/<hash>.<ext>  → public, max-age=1y, immutable  (Vite filenames
//     include a content hash, so new content always means a new URL)
//   - everything else       → no-cache, must-revalidate      (index.html and
//     friends must be re-fetched so the new hashed URLs are picked up)
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
			setStaticCacheHeaders(c, path)
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// SPA fallback: serve index.html for client-side routing
		c.Request.URL.Path = "/"
		setStaticCacheHeaders(c, "/index.html")
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}

// setStaticCacheHeaders picks the right Cache-Control for embedded assets.
// Files under /assets/ are content-hashed by Vite and safe to cache forever;
// everything else (index.html, favicons, logo files) must be revalidated so
// that upgrades take effect immediately instead of being masked by a cached
// index.html that still points at the previous bundle's hash.
func setStaticCacheHeaders(c *gin.Context, path string) {
	if strings.HasPrefix(path, "/assets/") {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		return
	}
	c.Header("Cache-Control", "no-cache, must-revalidate")
}
