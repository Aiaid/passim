package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/clientcfg"
	"github.com/passim/passim/internal/db"
	tmpl "github.com/passim/passim/internal/template"
)

// clientConfigResponse is the JSON shape for GET /api/apps/:id/client-config.
type clientConfigResponse struct {
	Type           string                    `json:"type"`
	QR             bool                      `json:"qr,omitempty"`
	Files          []clientConfigFile        `json:"files,omitempty"`
	Fields         []clientConfigField       `json:"fields,omitempty"`
	URLs           []clientConfigURL         `json:"urls,omitempty"`
	ImportURLs     map[string]string         `json:"import_urls,omitempty"`
	ShareSupported bool                      `json:"share_supported"`
	ShareToken     string                    `json:"share_token,omitempty"`
}

type clientConfigFile struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
}

type clientConfigField struct {
	Key    string            `json:"key"`
	Label  map[string]string `json:"label"`
	Value  string            `json:"value"`
	Secret bool              `json:"secret,omitempty"`
}

type clientConfigURL struct {
	Name   string `json:"name"`
	Scheme string `json:"scheme"`
	QR     bool   `json:"qr,omitempty"`
}

func appClientConfigHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplate(deps, c)
		if !ok {
			return
		}

		clientsDef := templateToClientsDef(t)
		if clientsDef == nil {
			c.JSON(http.StatusOK, gin.H{"error": "no client config defined for this template"})
			return
		}

		appCtx, nodeCtx := buildContexts(deps, app, t)

		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve config: " + err.Error()})
			return
		}

		// If file_per_user returned 0 files, it may be a permissions issue.
		// Try to fix permissions via docker exec and retry once.
		if resolved.Type == "file_per_user" && len(resolved.Files) == 0 && app.ContainerID != "" && deps.Docker != nil {
			fixConfigPermissions(deps, app.ContainerID, t)
			resolved, _ = clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		}

		resp := buildClientConfigResponse(resolved, t, deps.DB, app.ID)
		c.JSON(http.StatusOK, resp)
	}
}

func appClientConfigFileHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplate(deps, c)
		if !ok {
			return
		}

		indexStr := c.Param("index")
		index, err := strconv.Atoi(indexStr)
		if err != nil || index < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid index"})
			return
		}

		if t.Clients == nil || t.Clients.Type != "file_per_user" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "not a file_per_user template"})
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

func appClientConfigZIPHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplate(deps, c)
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve config: " + err.Error()})
			return
		}

		zipData, err := clientcfg.GenerateZIP([]clientcfg.ResolvedConfig{*resolved})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "generate zip: " + err.Error()})
			return
		}

		c.Header("Content-Disposition", "attachment; filename=\""+app.Template+"-configs.zip\"")
		c.Data(http.StatusOK, "application/zip", zipData)
	}
}

func appSubscribeHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, t, ok := loadAppAndTemplate(deps, c)
		if !ok {
			return
		}

		clientsDef := templateToClientsDef(t)
		if clientsDef == nil || clientsDef.Type != "url" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "not a url-type template"})
			return
		}

		// Resolve local config
		appCtx, nodeCtx := buildContexts(deps, app, t)
		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve config: " + err.Error()})
			return
		}

		configs := []clientcfg.ResolvedConfig{*resolved}

		// TODO: Phase F — aggregate remote node configs here

		yaml, err := clientcfg.GenerateClashYAML(configs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "generate subscription: " + err.Error()})
			return
		}

		c.Header("Content-Disposition", "inline; filename=\"subscribe.yaml\"")
		c.Data(http.StatusOK, "text/yaml; charset=utf-8", yaml)
	}
}

// --- helpers ---

func loadAppAndTemplate(deps Deps, c *gin.Context) (*db.App, *tmpl.Template, bool) {
	id := c.Param("id")
	app, err := db.GetApp(deps.DB, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return nil, nil, false
	}
	if app == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return nil, nil, false
	}

	if deps.Templates == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "template registry not available"})
		return nil, nil, false
	}
	t, ok := deps.Templates.Get(app.Template)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found: " + app.Template})
		return nil, nil, false
	}

	return app, t, true
}

func templateToClientsDef(t *tmpl.Template) *clientcfg.ClientsDef {
	if t.Clients == nil {
		return nil
	}
	def := &clientcfg.ClientsDef{
		Type:       t.Clients.Type,
		Source:     t.Clients.Source,
		Format:     t.Clients.Format,
		QR:         t.Clients.QR,
		ImportURLs: t.Clients.ImportURLs,
	}
	for _, f := range t.Clients.Fields {
		def.Fields = append(def.Fields, clientcfg.FieldDef{
			Key:    f.Key,
			Label:  f.Label,
			Value:  f.Value,
			Secret: f.Secret,
		})
	}
	for _, u := range t.Clients.URLs {
		def.URLs = append(def.URLs, clientcfg.URLDef{
			Name:   u.Name,
			Scheme: u.Scheme,
			QR:     u.QR,
		})
	}
	return def
}

func buildContexts(deps Deps, app *db.App, t *tmpl.Template) (clientcfg.AppContext, clientcfg.NodeContext) {
	dataDir := deps.DataDir
	if dataDir == "" {
		dataDir = defaultDataDir
	}
	appDir := filepath.Join(dataDir, "apps", app.Template+"-"+app.ID[:8])
	hostname, _ := os.Hostname()

	// Parse settings from JSON
	var settings map[string]interface{}
	json.Unmarshal([]byte(app.Settings), &settings)

	// Merge generated values into settings for template rendering
	var generated map[string]string
	json.Unmarshal([]byte(app.Generated), &generated)

	appCtx := clientcfg.AppContext{
		ID:       app.ID,
		Template: app.Template,
		Settings: settings,
		AppDir:   appDir,
	}

	// Ensure geo cache is populated
	geoOnce.Do(discoverGeo)

	nodeCtx := clientcfg.NodeContext{
		PublicIP:  cachedIP,
		Hostname:  hostname,
		Country:   cachedCC,
		DataDir:   dataDir,
	}

	return appCtx, nodeCtx
}

// fixConfigPermissions exec's into the app container to chmod config volumes
// so the passim process (running as a different UID) can read generated files.
func fixConfigPermissions(deps Deps, containerID string, t *tmpl.Template) {
	ctx := context.Background()
	for _, v := range t.Container.Volumes {
		parts := strings.SplitN(v, ":", 2)
		if len(parts) < 2 {
			continue
		}
		target := parts[1]
		// Strip :ro suffix if present
		if idx := strings.Index(target, ":"); idx >= 0 {
			target = target[:idx]
		}
		deps.Docker.ExecContainer(ctx, containerID, []string{"chmod", "-R", "o+rX", target})
	}
}

func buildClientConfigResponse(resolved *clientcfg.ResolvedConfig, t *tmpl.Template, database *sql.DB, appID string) clientConfigResponse {
	resp := clientConfigResponse{
		Type:           resolved.Type,
		QR:             resolved.QR,
		ShareSupported: t.Share != nil && t.Share.Supports,
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

	// Check if there's an existing share token
	if resp.ShareSupported {
		st, _ := db.GetShareTokenByApp(database, appID)
		if st != nil {
			resp.ShareToken = st.Token
		}
	}

	return resp
}
