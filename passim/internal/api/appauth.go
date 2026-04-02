package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
)

// appAuthHandler handles POST /internal/app-auth/:appId
// This endpoint is called by containers (e.g. Hysteria HTTP auth) to authenticate users.
// No JWT auth required — only accessible from container network.
func appAuthHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("appId")

		var req struct {
			Auth string `json:"auth"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Parse "username:password" format
		parts := strings.SplitN(req.Auth, ":", 2)
		if len(parts) != 2 || parts[0] == "" {
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}
		username := parts[0]
		password := parts[1]

		user, err := db.GetAppUserByUsername(deps.DB, appID, username)
		if err != nil || user == nil {
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check enabled
		if !user.Enabled {
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check password (plaintext comparison — these are proxy passwords, not login credentials)
		if user.Password != password {
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check quota
		if user.QuotaBytes > 0 {
			total, err := db.GetTotalTrafficByUser(deps.DB, appID, user.ID)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{"ok": false})
				return
			}
			if total >= user.QuotaBytes {
				c.JSON(http.StatusOK, gin.H{"ok": false})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"ok": true, "id": username})
	}
}
