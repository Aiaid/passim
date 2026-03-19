package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/update"
)

func versionCheckHandler(checker *update.Checker) gin.HandlerFunc {
	return func(c *gin.Context) {
		prerelease := c.Query("prerelease") == "true"
		force := c.Query("force") == "true"

		if prerelease {
			// Prerelease checks always fetch fresh (not cached)
			info, err := checker.CheckPrerelease(c.Request.Context())
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "failed to check for updates"})
				return
			}
			c.JSON(http.StatusOK, info)
			return
		}

		// Stable: return cached result if available, otherwise fetch
		info := checker.Cached()
		if info == nil || force {
			var err error
			info, err = checker.Check(c.Request.Context())
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "failed to check for updates"})
				return
			}
		}
		c.JSON(http.StatusOK, info)
	}
}

func updateHandler(updater *update.Updater) gin.HandlerFunc {
	return func(c *gin.Context) {
		if updater == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "updates not available (Docker not connected)"})
			return
		}

		var req struct {
			Version string `json:"version" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "version is required"})
			return
		}

		if err := updater.Execute(c.Request.Context(), req.Version); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  "updating",
			"message": "Update in progress. You will be disconnected briefly.",
		})
	}
}
