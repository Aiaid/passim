package api

import (
	"encoding/json"
	"fmt"
	"mime"
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

		var req createShareRequest
		c.ShouldBindJSON(&req)

		// Check for existing active token with same user_index
		existing, _ := db.GetShareTokenByAppAndUser(deps.DB, id, req.UserIndex)
		if existing != nil {
			scheme := "https"
			host := c.Request.Host
			c.JSON(http.StatusOK, createShareResponse{
				Token: existing.Token,
				URL:   scheme + "://" + host + "/s/" + existing.Token,
			})
			return
		}

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

		// If user_index query param is provided, revoke only that peer's share
		if uiStr := c.Query("user_index"); uiStr != "" {
			ui, err := strconv.Atoi(uiStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_index"})
				return
			}
			if err := db.RevokeShareTokenByUserIndex(deps.DB, id, ui); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

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

		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve: " + err.Error()})
			return
		}

		// If per-user share, filter to specific user index
		if st.UserIndex > 0 && clientsDef.Type == "file_per_user" {
			var filtered []clientcfg.ResolvedFile
			for _, f := range resolved.Files {
				if f.Index == st.UserIndex {
					filtered = append(filtered, f)
				}
			}
			resolved.Files = filtered
		}

		resp := buildShareResponse(resolved, t)

		// Aggregate remote node configs
		ctx := c.Request.Context()
		switch clientsDef.Type {
		case "url":
			for _, rc := range fetchRemoteConfigs(ctx, deps, app.Template) {
				if rc.Type != "url" || len(rc.URLs) == 0 {
					continue
				}
				g := shareRemoteGroup{
					NodeName:    rc.NodeName,
					NodeCountry: rc.NodeCountry,
				}
				for _, u := range rc.URLs {
					g.URLs = append(g.URLs, clientConfigURL{
						Name:   u.Name,
						Scheme: u.URI,
						QR:     u.QR,
					})
				}
				resp.RemoteGroups = append(resp.RemoteGroups, g)
			}
		case "file_per_user":
			for _, ra := range findRemoteApps(ctx, deps, app.Template) {
				ccStatus, ccBody, pErr := deps.NodeHub.ProxyRequest(
					ctx, ra.NodeID, "GET", "/api/apps/"+ra.AppID+"/client-config", nil,
				)
				if pErr != nil || ccStatus != http.StatusOK {
					continue
				}
				var ccResp clientConfigResponse
				if json.Unmarshal(ccBody, &ccResp) != nil || ccResp.Type != "file_per_user" || len(ccResp.Files) == 0 {
					continue
				}
				var files []clientConfigFile
				for _, f := range ccResp.Files {
					if st.UserIndex > 0 && f.Index != st.UserIndex {
						continue
					}
					files = append(files, f)
				}
				if len(files) > 0 {
					resp.RemoteGroups = append(resp.RemoteGroups, shareRemoteGroup{
						NodeName:    ra.NodeName,
						NodeID:      ra.NodeID,
						NodeCountry: ra.NodeCountry,
						AppID:       ra.AppID,
						Files:       files,
						QR:          ccResp.QR,
					})
				}
			}
		}

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

		resolved.NodeName = localNodeName(deps)
		configs := []clientcfg.ResolvedConfig{*resolved}
		// Aggregate configs from remote nodes running the same template
		configs = append(configs, fetchRemoteConfigs(c.Request.Context(), deps, app.Template)...)

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
		st, app, t, ok := loadShareContext(deps, c, token)
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

		// Enforce user_index restriction
		if st.UserIndex > 0 && index != st.UserIndex {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied for this peer index"})
			return
		}

		// Remote node file proxy
		nodeID := c.Query("node")
		remoteAppID := c.Query("app")
		if nodeID != "" && remoteAppID != "" && deps.NodeHub != nil {
			content, err := fetchRemoteFileContent(c.Request.Context(), deps, nodeID, remoteAppID, index)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "fetch remote file: " + err.Error()})
				return
			}
			name := fmt.Sprintf("peer%d.conf", index)
			c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
			c.Data(http.StatusOK, "application/octet-stream", content)
			return
		}

		// Local file
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

		c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
		c.Data(http.StatusOK, "application/octet-stream", []byte(content))
	}
}

func shareZIPHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		st, app, t, ok := loadShareContext(deps, c, token)
		if !ok {
			return
		}

		clientsDef := templateToClientsDef(t)
		if clientsDef == nil || clientsDef.Type != "file_per_user" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "not a file_per_user template"})
			return
		}

		appCtx, nodeCtx := buildContexts(deps, app, t)
		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve: " + err.Error()})
			return
		}

		userIndex := st.UserIndex
		if userIndex > 0 {
			var filtered []clientcfg.ResolvedFile
			for _, f := range resolved.Files {
				if f.Index == userIndex {
					filtered = append(filtered, f)
				}
			}
			resolved.Files = filtered
		}

		resolved.NodeName = localNodeName(deps)
		resolved.NodeCountry = nodeCtx.Country
		configs := []clientcfg.ResolvedConfig{*resolved}

		// Fetch remote files
		ctx := c.Request.Context()
		for _, ra := range findRemoteApps(ctx, deps, app.Template) {
			if rc := fetchRemoteFilePerUserConfig(ctx, deps, ra, userIndex); rc != nil {
				configs = append(configs, *rc)
			}
		}

		zipData, err := clientcfg.GenerateZIP(configs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "generate zip: " + err.Error()})
			return
		}

		c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": app.Template + "-configs.zip"}))
		c.Data(http.StatusOK, "application/zip", zipData)
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

type shareRemoteGroup struct {
	NodeName    string             `json:"node_name"`
	NodeID      string             `json:"node_id,omitempty"`
	NodeCountry string             `json:"node_country,omitempty"`
	AppID       string             `json:"app_id,omitempty"`
	URLs        []clientConfigURL  `json:"urls,omitempty"`
	Files       []clientConfigFile `json:"files,omitempty"`
	QR          bool               `json:"qr,omitempty"`
}

type shareResponse struct {
	Type         string              `json:"type"`
	QR           bool                `json:"qr,omitempty"`
	Files        []clientConfigFile  `json:"files,omitempty"`
	Fields       []clientConfigField `json:"fields,omitempty"`
	URLs         []clientConfigURL   `json:"urls,omitempty"`
	ImportURLs   map[string]string   `json:"import_urls,omitempty"`
	RemoteGroups []shareRemoteGroup  `json:"remote_groups,omitempty"`
	Guide        interface{}         `json:"guide,omitempty"`
	Limitations  []string            `json:"limitations,omitempty"`
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
