package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/clientcfg"
	"github.com/passim/passim/internal/db"
	tmpl "github.com/passim/passim/internal/template"
)

// loadAppAndTemplateWithUsers loads app + template, checks Users support.
// Returns (app, template, ok). Writes error response if not ok.
func loadAppAndTemplateWithUsers(deps Deps, c *gin.Context) (*db.App, *tmpl.Template, bool) {
	app, t, ok := loadAppAndTemplate(deps, c)
	if !ok {
		return nil, nil, false
	}
	if t.Users == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this template does not support user management"})
		return nil, nil, false
	}
	return app, t, true
}

type appUserResponse struct {
	ID                string `json:"id"`
	Username          string `json:"username"`
	Enabled           bool   `json:"enabled"`
	QuotaBytes        int64  `json:"quota_bytes"`
	UsedBytes         int64  `json:"used_bytes"`
	OnlineConnections int    `json:"online_connections"`
	ConnectionURI     string `json:"connection_uri,omitempty"`
	ShareURL          string `json:"share_url,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

func listAppUsersHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplateWithUsers(deps, c)
		if !ok {
			return
		}

		users, err := db.ListAppUsers(deps.DB, app.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Get online counts if metrics collector is available
		var onlineCounts map[string]int
		if deps.MetricsCollector != nil {
			onlineCounts = deps.MetricsCollector.GetOnline(app.ID)
		}

		// Build base URI from template for per-user URI generation
		_, nodeCtx := buildContexts(deps, app, t)
		baseURI := buildBaseURI(t, app, nodeCtx)

		// Get share tokens for this app
		shareTokens, _ := db.GetShareTokensByApp(deps.DB, app.ID)
		scheme := "https"
		host := c.Request.Host

		resp := make([]appUserResponse, 0, len(users))
		for i, u := range users {
			// Traffic logs are keyed by username (see Doc/apps/hysteria.md schema).
			usedBytes, _ := db.GetTotalTrafficByUser(deps.DB, app.ID, u.Username)
			online := 0
			if onlineCounts != nil {
				online = onlineCounts[u.Username]
			}

			// Generate per-user connection URI
			connURI := userConnectionURI(baseURI, u.Username, u.Password)

			// Find or create share token for this user (user_index = i+1, 0 is reserved for app-level)
			shareURL := ""
			userIndex := i + 1
			for _, st := range shareTokens {
				if st.UserIndex == userIndex {
					shareURL = scheme + "://" + host + "/s/" + st.Token
					break
				}
			}

			resp = append(resp, appUserResponse{
				ID:                u.ID,
				Username:          u.Username,
				Enabled:           u.Enabled,
				QuotaBytes:        u.QuotaBytes,
				UsedBytes:         usedBytes,
				OnlineConnections: online,
				ConnectionURI:     connURI,
				ShareURL:          shareURL,
				CreatedAt:         u.CreatedAt,
				UpdatedAt:         u.UpdatedAt,
			})
		}

		c.JSON(http.StatusOK, gin.H{"users": resp})
	}
}

type createAppUserRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	QuotaBytes *int64 `json:"quota_bytes"`
}

func createAppUserHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplateWithUsers(deps, c)
		if !ok {
			return
		}

		var req createAppUserRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		if req.Username == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "username is required"})
			return
		}

		// Check duplicate
		existing, _ := db.GetAppUserByUsername(deps.DB, app.ID, req.Username)
		if existing != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
			return
		}

		// Auto-generate password if empty
		password := req.Password
		if password == "" {
			password = uuid.New().String()
		}

		var quota int64
		if req.QuotaBytes != nil {
			quota = *req.QuotaBytes
		}

		user := &db.AppUser{
			ID:         uuid.New().String(),
			AppID:      app.ID,
			Username:   req.Username,
			Password:   password,
			Enabled:    true,
			QuotaBytes: quota,
		}

		if err := db.CreateAppUser(deps.DB, user); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Auto-create share token for this user
		userCount, _ := db.CountAppUsers(deps.DB, app.ID)
		shareToken := uuid.New().String()
		st := &db.ShareToken{
			ID:        uuid.New().String(),
			AppID:     app.ID,
			UserIndex: userCount, // 1-based index
			Token:     shareToken,
		}
		_ = db.CreateShareToken(deps.DB, st)

		scheme := "https"
		host := c.Request.Host
		shareURL := scheme + "://" + host + "/s/" + shareToken

		// Generate connection URI
		_, nodeCtx := buildContexts(deps, app, t)
		baseURI := buildBaseURI(t, app, nodeCtx)
		connURI := userConnectionURI(baseURI, user.Username, user.Password)

		c.JSON(http.StatusCreated, appUserResponse{
			ID:            user.ID,
			Username:      user.Username,
			Enabled:       user.Enabled,
			QuotaBytes:    user.QuotaBytes,
			ConnectionURI: connURI,
			ShareURL:      shareURL,
			CreatedAt:     user.CreatedAt,
			UpdatedAt:     user.UpdatedAt,
		})
	}
}

type updateAppUserRequest struct {
	Enabled    *bool   `json:"enabled"`
	Password   *string `json:"password"`
	QuotaBytes *int64  `json:"quota_bytes"`
}

func updateAppUserHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, _, ok := loadAppAndTemplateWithUsers(deps, c)
		if !ok {
			return
		}

		uid := c.Param("uid")

		var req updateAppUserRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		fields := make(map[string]interface{})
		if req.Enabled != nil {
			fields["enabled"] = *req.Enabled
		}
		if req.Password != nil {
			fields["password"] = *req.Password
		}
		if req.QuotaBytes != nil {
			fields["quota_bytes"] = *req.QuotaBytes
		}

		if len(fields) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
			return
		}

		if err := db.UpdateAppUser(deps.DB, uid, fields); err != nil {
			if strings.Contains(err.Error(), "not found") {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		updated, err := db.GetAppUser(deps.DB, uid)
		if err != nil || updated == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "fetch updated user"})
			return
		}

		c.JSON(http.StatusOK, appUserResponse{
			ID:         updated.ID,
			Username:   updated.Username,
			Enabled:    updated.Enabled,
			QuotaBytes: updated.QuotaBytes,
			CreatedAt:  updated.CreatedAt,
			UpdatedAt:  updated.UpdatedAt,
		})
	}
}

func deleteAppUserHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, _, ok := loadAppAndTemplateWithUsers(deps, c)
		if !ok {
			return
		}

		uid := c.Param("uid")
		if err := db.DeleteAppUser(deps.DB, uid); err != nil {
			if strings.Contains(err.Error(), "not found") {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.Status(http.StatusNoContent)
	}
}

func kickAppUserHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplateWithUsers(deps, c)
		if !ok {
			return
		}

		uid := c.Param("uid")

		user, err := db.GetAppUser(deps.DB, uid)
		if err != nil || user == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		if t.Users.Kick == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kick not supported for this template"})
			return
		}

		if t.Users.Kick.Method != "api" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported kick method: " + t.Users.Kick.Method})
			return
		}

		// Resolve the kick URL by replacing placeholders
		kickURL, secret, err := resolveKickParams(c.Request.Context(), deps, app, t)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve kick URL: " + err.Error()})
			return
		}

		// Make the kick API call
		if err := doKickAPICall(kickURL, secret, user.Username); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "kick failed: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// resolveKickParams resolves the kick URL and secret from the template config,
// replacing placeholders like {{container.ip}} and {{generated.stats_secret}}.
func resolveKickParams(ctx context.Context, deps Deps, app *db.App, t *tmpl.Template) (string, string, error) {
	kickURL := t.Users.Kick.URL
	secret := t.Users.Kick.Secret

	// Resolve {{container.ip}} by inspecting the Docker container
	if strings.Contains(kickURL, "{{container.ip}}") {
		if deps.Docker == nil || app.ContainerID == "" {
			return "", "", fmt.Errorf("cannot resolve container IP: no Docker client or container ID")
		}
		info, err := deps.Docker.InspectContainer(ctx, app.ContainerID)
		if err != nil {
			return "", "", fmt.Errorf("inspect container: %w", err)
		}
		containerIP := ""
		if info.NetworkSettings != nil && info.NetworkSettings.Networks != nil {
			for _, net := range info.NetworkSettings.Networks {
				if net.IPAddress != "" {
					containerIP = net.IPAddress
					break
				}
			}
		}
		if containerIP == "" {
			return "", "", fmt.Errorf("container has no IP address")
		}
		kickURL = strings.ReplaceAll(kickURL, "{{container.ip}}", containerIP)
	}

	// Resolve {{generated.*}} placeholders from app's stored generated values
	var generated map[string]string
	json.Unmarshal([]byte(app.Generated), &generated)
	for k, v := range generated {
		kickURL = strings.ReplaceAll(kickURL, "{{generated."+k+"}}", v)
		secret = strings.ReplaceAll(secret, "{{generated."+k+"}}", v)
	}

	return kickURL, secret, nil
}

// doKickAPICall sends an HTTP POST to the kick endpoint to disconnect a user.
func doKickAPICall(url, secret, username string) error {
	body := strings.NewReader(`["` + username + `"]`)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		req.Header.Set("Authorization", secret)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("kick API returned %d", resp.StatusCode)
	}
	return nil
}

// buildBaseURI renders the template's client URL scheme with app settings + node info,
// but keeps admin%3A{{settings.password}} as the auth placeholder for later per-user replacement.
func buildBaseURI(t *tmpl.Template, app *db.App, nodeCtx clientcfg.NodeContext) string {
	if t.Clients == nil || t.Clients.Type != "url" || len(t.Clients.URLs) == 0 {
		return ""
	}

	var settings map[string]interface{}
	json.Unmarshal([]byte(app.Settings), &settings)

	appCtx := clientcfg.AppContext{
		ID:       app.ID,
		Template: app.Template,
		Settings: settings,
	}

	resolved, err := clientcfg.Resolve(&clientcfg.ClientsDef{
		Type: "url",
		URLs: []clientcfg.URLDef{{
			Name:   t.Clients.URLs[0].Name,
			Scheme: t.Clients.URLs[0].Scheme,
			QR:     t.Clients.URLs[0].QR,
		}},
	}, appCtx, nodeCtx)
	if err != nil || len(resolved.URLs) == 0 {
		return ""
	}
	return resolved.URLs[0].URI
}

// userConnectionURI takes the base URI (which contains admin%3A<password>) and replaces
// the auth portion with the specific user's username:password.
func userConnectionURI(baseURI, username, password string) string {
	if baseURI == "" {
		return ""
	}
	// Base URI looks like: hysteria2://admin%3A<admin_password>@host:port/...
	// We need to replace the userinfo part (between :// and @)
	protoEnd := strings.Index(baseURI, "://")
	if protoEnd < 0 {
		return ""
	}
	atIdx := strings.Index(baseURI[protoEnd+3:], "@")
	if atIdx < 0 {
		return ""
	}
	atIdx += protoEnd + 3

	// URL-encode the colon in username:password so URL parsers treat it as a single unit
	newAuth := url.PathEscape(username) + "%3A" + url.PathEscape(password)
	return baseURI[:protoEnd+3] + newAuth + baseURI[atIdx:]
}
