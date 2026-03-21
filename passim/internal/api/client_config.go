package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

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
	ShareSupported bool              `json:"share_supported"`
	ShareToken     string            `json:"share_token,omitempty"`
	ShareTokens    map[int]string    `json:"share_tokens,omitempty"`
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
		appCtx.SubscribeURL = computeSubscribeURL(c, deps.DB, app.ID)

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

		// Optional user_index filter
		userIndex := 0
		if ui := c.Query("user_index"); ui != "" {
			userIndex, _ = strconv.Atoi(ui)
		}
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

		// Aggregate files from remote nodes
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
		appCtx.SubscribeURL = computeSubscribeURL(c, deps.DB, app.ID)
		resolved, err := clientcfg.Resolve(clientsDef, appCtx, nodeCtx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "resolve config: " + err.Error()})
			return
		}

		resolved.NodeName = localNodeName(deps)
		resolved.NodeCountry = nodeCtx.Country
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

// localNodeName returns the configured node name, falling back to the country
// code or the OS hostname.
func localNodeName(deps Deps) string {
	if name, _ := db.GetConfig(deps.DB, "node_name"); name != "" {
		return name
	}
	geoOnce.Do(discoverGeo)
	if _, _, cc, _, _ := readGeo(); cc != "" {
		return cc
	}
	h, _ := os.Hostname()
	return h
}

// computeSubscribeURL returns the best subscribe URL for an app.
// Prefers share-token-based URL (permanent, no auth) over authenticated URL.
func computeSubscribeURL(c *gin.Context, database *sql.DB, appID string) string {
	scheme := "https"
	host := c.Request.Host
	if st, _ := db.GetShareTokenByApp(database, appID); st != nil {
		return scheme + "://" + host + "/api/s/" + st.Token + "/subscribe"
	}
	return scheme + "://" + host + "/api/apps/" + appID + "/subscribe"
}

// computeShareSubscribeURL returns the subscribe URL for a share token.
func computeShareSubscribeURL(c *gin.Context, token string) string {
	return "https://" + c.Request.Host + "/api/s/" + token + "/subscribe"
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

	cfgIP, _, cfgCC, _, _ := readGeo()
	var sslDomain string
	if deps.SSL != nil {
		sslDomain = deps.SSL.GetDomain()
	}
	nodeCtx := clientcfg.NodeContext{
		PublicIP:  cfgIP,
		Hostname:  hostname,
		Country:   cfgCC,
		DataDir:   dataDir,
		Domain:    sslDomain,
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

	// Check if there are existing share tokens
	if resp.ShareSupported {
		tokens, _ := db.GetShareTokensByApp(database, appID)
		if len(tokens) > 0 {
			resp.ShareTokens = make(map[int]string, len(tokens))
			for _, st := range tokens {
				resp.ShareTokens[st.UserIndex] = st.Token
			}
			// Backward compat: set share_token to first token found
			resp.ShareToken = tokens[0].Token
		}
	}

	return resp
}

// --- Remote node helpers ---

// remoteAppInfo identifies an app on a remote node.
type remoteAppInfo struct {
	NodeID      string
	NodeName    string
	NodeCountry string
	AppID       string
}

// findRemoteApps returns remote apps matching a template name across all connected nodes.
func findRemoteApps(ctx context.Context, deps Deps, templateName string) []remoteAppInfo {
	if deps.NodeHub == nil {
		return nil
	}
	nodes := deps.NodeHub.ListNodes()
	if len(nodes) == 0 {
		return nil
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	var result []remoteAppInfo

	for _, n := range nodes {
		if n.Status != "connected" {
			continue
		}
		wg.Add(1)
		go func(nodeID, nodeName, nodeCountry string) {
			defer wg.Done()
			status, body, err := deps.NodeHub.ProxyRequest(ctx, nodeID, "GET", "/api/apps", nil)
			if err != nil || status != http.StatusOK {
				return
			}
			var apps []struct {
				ID       string `json:"id"`
				Template string `json:"template"`
			}
			if json.Unmarshal(body, &apps) != nil {
				return
			}
			for _, app := range apps {
				if app.Template == templateName {
					mu.Lock()
					result = append(result, remoteAppInfo{
						NodeID: nodeID, NodeName: nodeName,
						NodeCountry: nodeCountry, AppID: app.ID,
					})
					mu.Unlock()
				}
			}
		}(n.ID, n.Name, n.Country)
	}
	wg.Wait()
	return result
}

// fetchRemoteFileContent downloads a single config file from a remote node.
func fetchRemoteFileContent(ctx context.Context, deps Deps, nodeID, appID string, index int) ([]byte, error) {
	path := fmt.Sprintf("/api/apps/%s/client-config/file/%d", appID, index)
	status, body, err := deps.NodeHub.ProxyRequest(ctx, nodeID, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("remote returned status %d", status)
	}
	return body, nil
}

// fetchRemoteFilePerUserConfig fetches file_per_user config metadata and content
// from a remote node. If userIndex > 0, only fetches that specific peer.
func fetchRemoteFilePerUserConfig(ctx context.Context, deps Deps, ra remoteAppInfo, userIndex int) *clientcfg.ResolvedConfig {
	status, body, err := deps.NodeHub.ProxyRequest(
		ctx, ra.NodeID, "GET", "/api/apps/"+ra.AppID+"/client-config", nil,
	)
	if err != nil || status != http.StatusOK {
		return nil
	}

	var ccResp clientConfigResponse
	if json.Unmarshal(body, &ccResp) != nil {
		return nil
	}
	if ccResp.Type != "file_per_user" || len(ccResp.Files) == 0 {
		return nil
	}

	var files []clientcfg.ResolvedFile
	for _, f := range ccResp.Files {
		if userIndex > 0 && f.Index != userIndex {
			continue
		}
		content, err := fetchRemoteFileContent(ctx, deps, ra.NodeID, ra.AppID, f.Index)
		if err != nil {
			log.Printf("[remote] failed to fetch file %d from node %s: %v", f.Index, ra.NodeID, err)
			continue
		}
		files = append(files, clientcfg.ResolvedFile{
			Index:   f.Index,
			Name:    f.Name,
			Content: string(content),
		})
	}

	if len(files) == 0 {
		return nil
	}

	return &clientcfg.ResolvedConfig{
		Type:        "file_per_user",
		Files:       files,
		QR:          ccResp.QR,
		NodeName:    ra.NodeName,
		NodeCountry: ra.NodeCountry,
	}
}

// fetchRemoteConfigs queries all connected remote nodes for apps using the
// same template and returns their resolved client configs (url type only,
// metadata without file content). Used by subscription endpoints.
func fetchRemoteConfigs(ctx context.Context, deps Deps, templateName string) []clientcfg.ResolvedConfig {
	remoteApps := findRemoteApps(ctx, deps, templateName)
	if len(remoteApps) == 0 {
		return nil
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	var all []clientcfg.ResolvedConfig

	for _, ra := range remoteApps {
		wg.Add(1)
		go func(ra remoteAppInfo) {
			defer wg.Done()

			cfgs := fetchNodeAppConfigs(ctx, deps, ra)
			if len(cfgs) > 0 {
				mu.Lock()
				all = append(all, cfgs...)
				mu.Unlock()
			}
		}(ra)
	}

	wg.Wait()
	return all
}

// fetchNodeAppConfigs fetches the client config for a single app on a remote node.
func fetchNodeAppConfigs(ctx context.Context, deps Deps, ra remoteAppInfo) []clientcfg.ResolvedConfig {
	ccStatus, ccBody, err := deps.NodeHub.ProxyRequest(
		ctx, ra.NodeID, "GET", "/api/apps/"+ra.AppID+"/client-config", nil,
	)
	if err != nil || ccStatus != http.StatusOK {
		log.Printf("[subscribe] failed to get client-config for app %s on node %s: status=%d err=%v",
			ra.AppID, ra.NodeID, ccStatus, err)
		return nil
	}

	var ccResp clientConfigResponse
	if err := json.Unmarshal(ccBody, &ccResp); err != nil {
		log.Printf("[subscribe] failed to parse client-config from node %s: %v", ra.NodeID, err)
		return nil
	}

	switch ccResp.Type {
	case "url":
		if len(ccResp.URLs) == 0 {
			return nil
		}
		var urls []clientcfg.ResolvedURL
		for _, u := range ccResp.URLs {
			urls = append(urls, clientcfg.ResolvedURL{
				Name: u.Name,
				URI:  u.Scheme,
				QR:   u.QR,
			})
		}
		return []clientcfg.ResolvedConfig{{
			Type:        "url",
			URLs:        urls,
			ImportURLs:  ccResp.ImportURLs,
			NodeName:    ra.NodeName,
			NodeCountry: ra.NodeCountry,
		}}
	case "file_per_user":
		if len(ccResp.Files) == 0 {
			return nil
		}
		var files []clientcfg.ResolvedFile
		for _, f := range ccResp.Files {
			files = append(files, clientcfg.ResolvedFile{
				Index: f.Index,
				Name:  f.Name,
			})
		}
		return []clientcfg.ResolvedConfig{{
			Type:        "file_per_user",
			Files:       files,
			QR:          ccResp.QR,
			NodeName:    ra.NodeName,
			NodeCountry: ra.NodeCountry,
		}}
	default:
		return nil
	}
}
