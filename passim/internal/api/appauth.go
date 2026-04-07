package api

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
)

// authRateLimiter tracks failed auth attempts per IP to prevent brute force.
type authRateLimiter struct {
	mu       sync.Mutex
	failures map[string][]time.Time
}

var authLimiter = &authRateLimiter{failures: make(map[string][]time.Time)}

const (
	authRateWindow   = 1 * time.Minute
	authRateMaxFails = 10
)

// authRateLimitMiddleware rejects IPs with too many failed auth attempts.
func authRateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		authLimiter.mu.Lock()
		now := time.Now()
		// Clean old entries
		times := authLimiter.failures[ip]
		cutoff := now.Add(-authRateWindow)
		clean := times[:0]
		for _, t := range times {
			if t.After(cutoff) {
				clean = append(clean, t)
			}
		}
		authLimiter.failures[ip] = clean
		if len(clean) >= authRateMaxFails {
			authLimiter.mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{"ok": false})
			c.Abort()
			return
		}
		authLimiter.mu.Unlock()
		c.Next()
	}
}

// recordAuthFailure records a failed auth attempt for rate limiting.
func recordAuthFailure(ip string) {
	authLimiter.mu.Lock()
	authLimiter.failures[ip] = append(authLimiter.failures[ip], time.Now())
	authLimiter.mu.Unlock()
}

// appAuthHandler handles POST /internal/app-auth/:appId
// Called by app containers (e.g. Hysteria HTTP auth) to authenticate users.
// Protected by rate limiting — no JWT required (containers can't obtain tokens).
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
			recordAuthFailure(c.ClientIP())
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check enabled
		if !user.Enabled {
			recordAuthFailure(c.ClientIP())
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check password (plaintext comparison — these are proxy passwords, not login credentials)
		if user.Password != password {
			recordAuthFailure(c.ClientIP())
			c.JSON(http.StatusOK, gin.H{"ok": false})
			return
		}

		// Check quota. NOTE: app_traffic_logs.user_id stores the username
		// (the "id" returned to Hysteria's auth callback), not user.ID —
		// see Doc/apps/hysteria.md schema section.
		if user.QuotaBytes > 0 {
			total, err := db.GetTotalTrafficByUser(deps.DB, appID, user.Username)
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
