package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

func listAppUsersHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, _, ok := loadAppAndTemplateWithUsers(deps, c)
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

		resp := make([]appUserResponse, 0, len(users))
		for _, u := range users {
			usedBytes, _ := db.GetTotalTrafficByUser(deps.DB, app.ID, u.ID)
			online := 0
			if onlineCounts != nil {
				online = onlineCounts[u.Username]
			}
			resp = append(resp, appUserResponse{
				ID:                u.ID,
				Username:          u.Username,
				Enabled:           u.Enabled,
				QuotaBytes:        u.QuotaBytes,
				UsedBytes:         usedBytes,
				OnlineConnections: online,
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
		app, _, ok := loadAppAndTemplateWithUsers(deps, c)
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

		c.JSON(http.StatusCreated, appUserResponse{
			ID:         user.ID,
			Username:   user.Username,
			Enabled:    user.Enabled,
			QuotaBytes: user.QuotaBytes,
			CreatedAt:  user.CreatedAt,
			UpdatedAt:  user.UpdatedAt,
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
