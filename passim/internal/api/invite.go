package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/node"
)

const (
	defaultInviteTTL = 24 * time.Hour
	invitePrefix     = "psk_invite_"
)

type createInviteRequest struct {
	Note       string `json:"note"`
	TTLSeconds int64  `json:"ttl_seconds"`
}

type inviteResponse struct {
	Token       string `json:"token"`
	Note        string `json:"note"`
	ExpiresAt   int64  `json:"expires_at"`
	CreatedAt   int64  `json:"created_at"`
	HubAddress  string `json:"hub_address"`
	InstallCmd  string `json:"install_cmd"`
	DockerCmd   string `json:"docker_cmd"`
}

type inviteListItem struct {
	Token     string `json:"token"`
	Note      string `json:"note"`
	ExpiresAt int64  `json:"expires_at"`
	CreatedAt int64  `json:"created_at"`
	RevokedAt *int64 `json:"revoked_at"`
}

type joinRequest struct {
	Token         string `json:"token" binding:"required"`
	Name          string `json:"name"`
	Address       string `json:"address" binding:"required"`
	APIKey        string `json:"api_key" binding:"required"`
	Version       string `json:"version"`
	SkipTLSVerify bool   `json:"skip_tls_verify"`
}

func generateInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return invitePrefix + hex.EncodeToString(b), nil
}

// resolveHubAddress determines the public address callers should target.
// Priority: SSL_DOMAIN env > sslMgr.GetDomain() (DNS reflector) > request Host
// header (whatever the caller used to reach this server). The result always
// carries the scheme; the port is omitted for 443/80.
func resolveHubAddress(deps Deps, c *gin.Context) string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8443"
	}
	scheme := "https"
	if os.Getenv("SSL_MODE") == "off" {
		scheme = "http"
	}

	host := os.Getenv("SSL_DOMAIN")
	if host == "" && deps.SSL != nil {
		host = deps.SSL.GetDomain()
	}
	if host == "" && c != nil && c.Request != nil && c.Request.Host != "" {
		// Host header already includes :port when non-default — return as-is.
		return scheme + "://" + c.Request.Host
	}
	if host == "" {
		return ""
	}

	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		return scheme + "://" + host
	}
	return scheme + "://" + host + ":" + port
}

func buildInstallCmd(token, hubAddr string) string {
	return fmt.Sprintf(
		"curl -fsSL https://raw.githubusercontent.com/aiaid/passim/main/install.sh | INVITE=%s HUB=%s sudo -E bash",
		token, hubAddr,
	)
}

func buildDockerCmd(token, hubAddr string) string {
	return fmt.Sprintf(
		"docker run -d --name passim --restart=always -p 8443:8443 -p 80:80 -v passim_data:/data -v /var/run/docker.sock:/var/run/docker.sock -e INVITE=%s -e HUB=%s ghcr.io/aiaid/passim:latest",
		token, hubAddr,
	)
}

func createInviteHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req createInviteRequest
		// Empty body is allowed: defaults apply.
		_ = c.ShouldBindJSON(&req)

		ttl := defaultInviteTTL
		if req.TTLSeconds > 0 {
			ttl = time.Duration(req.TTLSeconds) * time.Second
		}

		token, err := generateInviteToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "generate token"})
			return
		}

		now := time.Now()
		row := &db.InviteToken{
			Token:     token,
			Note:      req.Note,
			ExpiresAt: now.Add(ttl).Unix(),
			CreatedAt: now.Unix(),
		}
		if err := db.CreateInviteToken(deps.DB, row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		hubAddr := resolveHubAddress(deps, c)
		c.JSON(http.StatusCreated, inviteResponse{
			Token:      row.Token,
			Note:       row.Note,
			ExpiresAt:  row.ExpiresAt,
			CreatedAt:  row.CreatedAt,
			HubAddress: hubAddr,
			InstallCmd: buildInstallCmd(row.Token, hubAddr),
			DockerCmd:  buildDockerCmd(row.Token, hubAddr),
		})
	}
}

func listInvitesHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.ListActiveInviteTokens(deps.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		out := make([]inviteListItem, 0, len(rows))
		for _, t := range rows {
			out = append(out, inviteListItem{
				Token:     t.Token,
				Note:      t.Note,
				ExpiresAt: t.ExpiresAt,
				CreatedAt: t.CreatedAt,
				RevokedAt: t.RevokedAt,
			})
		}
		c.JSON(http.StatusOK, out)
	}
}

func revokeInviteHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		if err := db.RevokeInviteToken(deps.DB, token); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "revoked"})
	}
}

func joinClusterHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req joinRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		t, err := db.ValidateInviteToken(deps.DB, req.Token)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if t == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired invite token"})
			return
		}

		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		info, err := deps.NodeHub.AddNodeFromInvite(c.Request.Context(), req.Address, req.APIKey, req.Name, req.SkipTLSVerify)
		if err != nil {
			var tlsErr *node.TLSError
			if errors.As(err, &tlsErr) {
				c.JSON(http.StatusBadGateway, gin.H{
					"error":     "TLS certificate verification failed",
					"tls_error": true,
				})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":     info.ID,
			"status": "joined",
		})
	}
}
