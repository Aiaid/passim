package api

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
)

type authHandler struct {
	database *sql.DB
	jwt      *auth.JWTManager
	pairing  *auth.PairingStore
}

type loginRequest struct {
	APIKey string `json:"api_key" binding:"required"`
}

func (h *authHandler) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "api_key is required"})
		return
	}

	hash, err := db.GetConfig(h.database, "api_key_hash")
	if err != nil || hash == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server not initialised"})
		return
	}

	if !auth.VerifyAPIKey(req.APIKey, hash) {
		// Fall back to pairing token check.
		if h.pairing == nil || !h.pairing.Verify(req.APIKey) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
			return
		}
	}

	version, err := h.authVersion()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	token, exp, err := h.jwt.Issue(version)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"expires_at": exp,
	})
}

type refreshRequest struct {
	Token string `json:"token" binding:"required"`
}

func (h *authHandler) refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	claims, err := h.jwt.Verify(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	version, err := h.authVersion()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if claims.AuthVersion != version {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token revoked"})
		return
	}

	token, exp, err := h.jwt.Issue(version)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"expires_at": exp,
	})
}

const pairingTTL = 5 * time.Minute

func (h *authHandler) createPairing(c *gin.Context) {
	if h.pairing == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pairing not available"})
		return
	}

	token, err := auth.GeneratePairingToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	h.pairing.Store(token, pairingTTL)

	nodeName, _ := db.GetConfig(h.database, "node_name")

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"name":       nodeName,
		"expires_in": int(pairingTTL.Seconds()),
	})
}

func (h *authHandler) authVersion() (int, error) {
	val, err := db.GetConfig(h.database, "auth_version")
	if err != nil {
		return 0, err
	}
	if val == "" {
		return 1, nil
	}
	return strconv.Atoi(val)
}
