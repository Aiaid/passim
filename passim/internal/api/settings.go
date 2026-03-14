package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
)

type updateSettingsRequest struct {
	NodeName *string `json:"node_name"`
}

func updateSettingsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req updateSettingsRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		if req.NodeName != nil {
			name := strings.TrimSpace(*req.NodeName)
			if len(name) > 64 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "node_name too long (max 64)"})
				return
			}
			if err := db.SetConfig(deps.DB, "node_name", name); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save node_name"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func getSettingsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		nodeName, _ := db.GetConfig(deps.DB, "node_name")
		c.JSON(http.StatusOK, gin.H{
			"node_name": nodeName,
		})
	}
}
