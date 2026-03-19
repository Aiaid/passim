package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/clientcfg"
	"github.com/passim/passim/internal/db"
	tmpl "github.com/passim/passim/internal/template"
)

type createShareRequest struct {
	UserIndex int `json:"user_index"`
}

type createShareResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

func createShareHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		app, err := db.GetApp(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if app == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
			return
		}

		// Check if template supports sharing
		if deps.Templates != nil {
			t, ok := deps.Templates.Get(app.Template)
			if ok && (t.Share == nil || !t.Share.Supports) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "this app does not support sharing"})
				return
			}
		}

		// Check for existing active token
		existing, _ := db.GetShareTokenByApp(deps.DB, id)
		if existing != nil {
			scheme := "https"
			host := c.Request.Host
			c.JSON(http.StatusOK, createShareResponse{
				Token: existing.Token,
				URL:   scheme + "://" + host + "/s/" + existing.Token,
			})
			return
		}

		var req createShareRequest
		c.ShouldBindJSON(&req)

		token := uuid.New().String()
		st := &db.ShareToken{
			ID:        uuid.New().String(),
			AppID:     id,
			UserIndex: req.UserIndex,
			Token:     token,
		}

		if err := db.CreateShareToken(deps.DB, st); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "create share: " + err.Error()})
			return
		}

		scheme := "https"
		host := c.Request.Host
		c.JSON(http.StatusCreated, createShareResponse{
			Token: token,
			URL:   scheme + "://" + host + "/s/" + token,
		})
	}
}

func revokeShareHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if err := db.RevokeShareTokens(deps.DB, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// --- Public share endpoints (no auth) ---

func shareConfigHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		st, app, t, ok := loadShareContext(deps, c, token)
		if !ok {
			return
		}

		clientsDef := templateToClientsDef(t)
		if clientsDef == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "no client config"})
			return
		}

		appCtx, nodeCtx := buildContexts(deps, app, t)
		appCtx.SubscribeURL = computeShareSubscribeURL(c, token)

		// If per-user share, filter to specific user index
		if st.UserIndex > 0 && clientsDef.Type == "file_per_user" {
			// Resolve only the specific peer
			resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve: " + err.Error()})
				return
			}
			// Filter to the requested index
			var filtered []clientcfg.ResolvedFile
			for _, f := range resolved.Files {
				if f.Index == st.UserIndex {
					filtered = append(filtered, f)
				}
			}
			resolved.Files = filtered
			resp := buildShareResponse(resolved, t)
			c.JSON(http.StatusOK, resp)
			return
		}

		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve: " + err.Error()})
			return
		}

		resp := buildShareResponse(resolved, t)
		c.JSON(http.StatusOK, resp)
	}
}

func shareSubscribeHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		_, app, t, ok := loadShareContext(deps, c, token)
		if !ok {
			return
		}

		clientsDef := templateToClientsDef(t)
		if clientsDef == nil || clientsDef.Type != "url" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "not a url-type template"})
			return
		}

		appCtx, nodeCtx := buildContexts(deps, app, t)
		appCtx.SubscribeURL = computeShareSubscribeURL(c, token)
		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve: " + err.Error()})
			return
		}

		configs := []clientcfg.ResolvedConfig{*resolved}
		// TODO: Phase F — aggregate remote node configs

		yaml, err := clientcfg.GenerateClashYAML(configs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "generate subscription: " + err.Error()})
			return
		}

		c.Header("Content-Disposition", "inline; filename=\"subscribe.yaml\"")
		c.Data(http.StatusOK, "text/yaml; charset=utf-8", yaml)
	}
}

func shareFileHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		_, app, t, ok := loadShareContext(deps, c, token)
		if !ok {
			return
		}

		if t.Clients == nil || t.Clients.Type != "file_per_user" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "not a file_per_user template"})
			return
		}

		indexStr := c.Param("index")
		index, err := parseIndex(indexStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid index"})
			return
		}

		dataDir := deps.DataDir
		if dataDir == "" {
			dataDir = defaultDataDir
		}
		appDir := filepath.Join(dataDir, "apps", app.Template+"-"+app.ID[:8])

		name, content, err := clientcfg.ReadFileByIndexWithFallback(t.Clients.Source, appDir, dataDir, app.Template, index)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "config file not found"})
			return
		}

		c.Header("Content-Disposition", "attachment; filename=\""+name+"\"")
		c.Data(http.StatusOK, "application/octet-stream", []byte(content))
	}
}

// --- helpers ---

func loadShareContext(deps Deps, c *gin.Context, token string) (*db.ShareToken, *db.App, *tmpl.Template, bool) {
	st, err := db.GetShareToken(deps.DB, token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return nil, nil, nil, false
	}
	if st == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "share link not found or revoked"})
		return nil, nil, nil, false
	}

	app, err := db.GetApp(deps.DB, st.AppID)
	if err != nil || app == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return nil, nil, nil, false
	}

	if deps.Templates == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "template registry not available"})
		return nil, nil, nil, false
	}
	t, ok := deps.Templates.Get(app.Template)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return nil, nil, nil, false
	}

	return st, app, t, true
}

type shareResponse struct {
	Type        string                 `json:"type"`
	QR          bool                   `json:"qr,omitempty"`
	Files       []clientConfigFile     `json:"files,omitempty"`
	Fields      []clientConfigField    `json:"fields,omitempty"`
	URLs        []clientConfigURL      `json:"urls,omitempty"`
	ImportURLs  map[string]string      `json:"import_urls,omitempty"`
	Guide       interface{}            `json:"guide,omitempty"`
	Limitations []string               `json:"limitations,omitempty"`
}

func buildShareResponse(resolved *clientcfg.ResolvedConfig, t *tmpl.Template) shareResponse {
	resp := shareResponse{
		Type:        resolved.Type,
		QR:          resolved.QR,
		Limitations: t.Limitations,
	}

	if t.Guide != nil {
		resp.Guide = t.Guide
	}

	switch resolved.Type {
	case "file_per_user":
		for _, f := range resolved.Files {
			resp.Files = append(resp.Files, clientConfigFile{
				Index: f.Index,
				Name:  f.Name,
			})
		}
	case "credentials":
		for _, f := range resolved.Credentials {
			resp.Fields = append(resp.Fields, clientConfigField{
				Key:    f.Key,
				Label:  f.Label,
				Value:  f.Value,
				Secret: f.Secret,
			})
		}
	case "url":
		for _, u := range resolved.URLs {
			resp.URLs = append(resp.URLs, clientConfigURL{
				Name:   u.Name,
				Scheme: u.URI,
				QR:     u.QR,
			})
		}
		resp.ImportURLs = resolved.ImportURLs
	}

	return resp
}

func parseIndex(s string) (int, error) {
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("invalid index: %s", s)
	}
	return n, nil
}
