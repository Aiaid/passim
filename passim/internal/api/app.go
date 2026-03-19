package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	tmpl "github.com/passim/passim/internal/template"
)

const defaultDataDir = "/data"

type deployRequest struct {
	Template string                 `json:"template" binding:"required"`
	Settings map[string]interface{} `json:"settings"`
}

type appResponse struct {
	ID          string                 `json:"id"`
	Template    string                 `json:"template"`
	Settings    map[string]interface{} `json:"settings"`
	Status      string                 `json:"status"`
	ContainerID string                 `json:"container_id,omitempty"`
	DeployedAt  string                 `json:"deployed_at,omitempty"`
	UpdatedAt   string                 `json:"updated_at,omitempty"`
}

type deployAppResponse struct {
	ID          string                 `json:"id"`
	Template    string                 `json:"template"`
	Settings    map[string]interface{} `json:"settings"`
	Status      string                 `json:"status"`
	ContainerID string                 `json:"container_id,omitempty"`
	TaskID      string                 `json:"task_id,omitempty"`
}

func deployAppHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}
		if deps.Templates == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "template registry not available"})
			return
		}

		var req deployRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		// 1. Find template
		t, ok := deps.Templates.Get(req.Template)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found: " + req.Template})
			return
		}

		// 1.5. Check for existing active deployment of this template
		existing, err := db.GetActiveAppByTemplate(deps.DB, req.Template)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "check existing: " + err.Error()})
			return
		}
		if existing != nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": "template already deployed",
				"app_id": existing.ID,
				"status": existing.Status,
			})
			return
		}

		// 2. Validate and merge settings
		if req.Settings == nil {
			req.Settings = make(map[string]interface{})
		}
		merged, err := tmpl.ValidateSettings(t.Settings, req.Settings)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 3. Generate values and resolve generated references in settings
		var generated map[string]string
		if len(t.Generated) > 0 {
			generated = tmpl.GenerateValues(t.Generated)
			tmpl.ResolveGeneratedDefaults(merged, generated)
		}

		// 4. Render template
		dataDir := deps.DataDir
		if dataDir == "" {
			dataDir = defaultDataDir
		}
		appID := uuid.New().String()
		hostname, _ := os.Hostname()
		tz := os.Getenv("TZ")
		if tz == "" {
			tz = time.Now().Location().String()
		}
		appPublicIP, _, _, _, _ := readGeo()
		var sslDomain string
		if deps.SSL != nil {
			sslDomain = deps.SSL.GetDomain()
		}
		nodeInfo := tmpl.NodeInfo{
			PublicIP:  appPublicIP,
			Timezone:  tz,
			Hostname:  hostname,
			DataDir:   dataDir,
			Domain:    sslDomain,
		}
		appDir := filepath.Join(dataDir, "apps", t.Name+"-"+appID[:8])
		rendered, err := tmpl.Render(t, tmpl.RenderData{
			Settings:  merged,
			Node:      nodeInfo,
			Generated: generated,
			App:       tmpl.AppInfo{Dir: appDir},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "render failed: " + err.Error()})
			return
		}

		// 5. Build deploy request

		var configFiles []docker.DeployConfigFile
		for _, cf := range rendered.ConfigFiles {
			configFiles = append(configFiles, docker.DeployConfigFile{
				Path:    cf.Path,
				Content: cf.Content,
			})
		}

		deployReq := &docker.DeployRequest{
			AppID:       appID,
			AppName:     t.Name,
			Image:       rendered.Image,
			Env:         rendered.Environment,
			Ports:       rendered.Ports,
			Volumes:     rendered.Volumes,
			Labels:      rendered.Labels,
			CapAdd:      rendered.CapAdd,
			Sysctls:     rendered.Sysctls,
			Args:        rendered.Args,
			ConfigFiles:  configFiles,
			DataDir:      dataDir,
			DataVolume:   deps.DataVolume,
			DataHostPath: deps.DataHostPath,
		}

		// Async path: enqueue deploy task
		if deps.Tasks != nil {
			settingsJSON, _ := json.Marshal(merged)
			generatedJSON, _ := json.Marshal(generated)
			app := &db.App{
				ID:        appID,
				Template:  t.Name,
				Settings:  string(settingsJSON),
				Generated: string(generatedJSON),
				Status:    "deploying",
			}
			if err := db.CreateApp(deps.DB, app); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "save app: " + err.Error()})
				return
			}

			payload, _ := json.Marshal(deployReq)
			taskID, err := deps.Tasks.Enqueue("deploy", appID, string(payload))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue deploy: " + err.Error()})
				return
			}

			c.JSON(http.StatusAccepted, deployAppResponse{
				ID:       appID,
				Template: t.Name,
				Settings: merged,
				Status:   "deploying",
				TaskID:   taskID,
			})
			return
		}

		// Sync path: deploy immediately
		result, err := docker.Deploy(c.Request.Context(), deps.Docker, deployReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "deploy failed: " + err.Error()})
			return
		}

		settingsJSON, _ := json.Marshal(merged)
		generatedJSON, _ := json.Marshal(generated)
		app := &db.App{
			ID:          appID,
			Template:    t.Name,
			Settings:    string(settingsJSON),
			Generated:   string(generatedJSON),
			Status:      "running",
			ContainerID: result.ContainerID,
		}
		if err := db.CreateApp(deps.DB, app); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "save app: " + err.Error()})
			return
		}

		c.JSON(http.StatusCreated, appResponse{
			ID:          appID,
			Template:    t.Name,
			Settings:    merged,
			Status:      "running",
			ContainerID: result.ContainerID,
		})
	}
}

func listAppsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		apps, err := db.ListApps(deps.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "list apps: " + err.Error()})
			return
		}

		var resp []appResponse
		for _, a := range apps {
			var settings map[string]interface{}
			json.Unmarshal([]byte(a.Settings), &settings)
			resp = append(resp, appResponse{
				ID:          a.ID,
				Template:    a.Template,
				Settings:    settings,
				Status:      a.Status,
				ContainerID: a.ContainerID,
				DeployedAt:  a.DeployedAt,
				UpdatedAt:   a.UpdatedAt,
			})
		}

		if resp == nil {
			resp = []appResponse{}
		}
		c.JSON(http.StatusOK, resp)
	}
}

func getAppHandler(deps Deps) gin.HandlerFunc {
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

		var settings map[string]interface{}
		json.Unmarshal([]byte(app.Settings), &settings)

		c.JSON(http.StatusOK, appResponse{
			ID:          app.ID,
			Template:    app.Template,
			Settings:    settings,
			Status:      app.Status,
			ContainerID: app.ContainerID,
			DeployedAt:  app.DeployedAt,
			UpdatedAt:   app.UpdatedAt,
		})
	}
}

type undeployPayload struct {
	AppID       string `json:"app_id"`
	ContainerID string `json:"container_id"`
	Template    string `json:"template"`
	DataDir     string `json:"data_dir"`
}

func deleteAppHandler(deps Deps) gin.HandlerFunc {
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

		// Async path: enqueue undeploy task
		if deps.Tasks != nil {
			dataDir := deps.DataDir
			if dataDir == "" {
				dataDir = defaultDataDir
			}

			payload, _ := json.Marshal(undeployPayload{
				AppID:       app.ID,
				ContainerID: app.ContainerID,
				Template:    app.Template,
				DataDir:     dataDir,
			})

			taskID, err := deps.Tasks.Enqueue("undeploy", app.ID, string(payload))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue undeploy: " + err.Error()})
				return
			}

			// Mark app as undeploying
			_ = db.UpdateApp(deps.DB, id, "undeploying", app.ContainerID)

			c.JSON(http.StatusAccepted, gin.H{"status": "undeploying", "task_id": taskID})
			return
		}

		// Sync path: undeploy immediately
		if deps.Docker != nil {
			dataDir := deps.DataDir
			if dataDir == "" {
				dataDir = defaultDataDir
			}
			docker.Undeploy(context.Background(), deps.Docker, app.ContainerID, app.Template, app.ID, dataDir)
		}

		if err := db.DeleteApp(deps.DB, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	}
}

type updateAppRequest struct {
	Settings map[string]interface{} `json:"settings"`
}

// buildDeployReq renders a template with the given settings and returns a DeployRequest.
func buildDeployReq(deps Deps, t *tmpl.Template, appID string, settings map[string]interface{}, generated map[string]string) (*docker.DeployRequest, error) {
	dataDir := deps.DataDir
	if dataDir == "" {
		dataDir = defaultDataDir
	}
	hostname, _ := os.Hostname()
	tz := os.Getenv("TZ")
	if tz == "" {
		tz = time.Now().Location().String()
	}
	redeployIP, _, _, _, _ := readGeo()
	var redeployDomain string
	if deps.SSL != nil {
		redeployDomain = deps.SSL.GetDomain()
	}
	appDir := filepath.Join(dataDir, "apps", t.Name+"-"+appID[:8])
	rendered, err := tmpl.Render(t, tmpl.RenderData{
		Settings: settings,
		Node: tmpl.NodeInfo{
			PublicIP:  redeployIP,
			Timezone:  tz,
			Hostname:  hostname,
			DataDir:   dataDir,
			Domain:    redeployDomain,
		},
		Generated: generated,
		App:       tmpl.AppInfo{Dir: appDir},
	})
	if err != nil {
		return nil, err
	}

	var configFiles []docker.DeployConfigFile
	for _, cf := range rendered.ConfigFiles {
		configFiles = append(configFiles, docker.DeployConfigFile{
			Path:    cf.Path,
			Content: cf.Content,
		})
	}

	return &docker.DeployRequest{
		AppID:       appID,
		AppName:     t.Name,
		Image:       rendered.Image,
		Env:         rendered.Environment,
		Ports:       rendered.Ports,
		Volumes:     rendered.Volumes,
		Labels:      rendered.Labels,
		CapAdd:      rendered.CapAdd,
		Sysctls:     rendered.Sysctls,
		Args:        rendered.Args,
		ConfigFiles:  configFiles,
		DataDir:      dataDir,
		DataVolume:   deps.DataVolume,
		DataHostPath: deps.DataHostPath,
	}, nil
}

func updateAppHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

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

		var req updateAppRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		// Look up template
		if deps.Templates == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "template registry not available"})
			return
		}
		t, ok := deps.Templates.Get(app.Template)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "template not found: " + app.Template})
			return
		}

		// Validate and merge settings
		if req.Settings == nil {
			req.Settings = make(map[string]interface{})
		}
		merged, err := tmpl.ValidateSettings(t.Settings, req.Settings)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Save settings to DB
		settingsJSON, _ := json.Marshal(merged)
		if err := db.UpdateAppSettings(deps.DB, id, string(settingsJSON)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Render template and rebuild container with new settings
		deployReq, err := buildDeployReq(deps, t, app.ID, merged, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "render failed: " + err.Error()})
			return
		}

		// Async path: enqueue redeploy task
		if deps.Tasks != nil {
			_ = db.UpdateApp(deps.DB, id, "deploying", app.ContainerID)

			payload, _ := json.Marshal(deployReq)
			taskID, err := deps.Tasks.Enqueue("deploy", app.ID, string(payload))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue redeploy: " + err.Error()})
				return
			}

			c.JSON(http.StatusAccepted, gin.H{
				"status":   "deploying",
				"task_id":  taskID,
				"settings": merged,
			})
			return
		}

		// Sync path: redeploy immediately
		result, err := docker.Deploy(c.Request.Context(), deps.Docker, deployReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "redeploy failed: " + err.Error()})
			return
		}

		_ = db.UpdateApp(deps.DB, id, "running", result.ContainerID)

		updated, _ := db.GetApp(deps.DB, id)
		var settings map[string]interface{}
		json.Unmarshal([]byte(updated.Settings), &settings)

		c.JSON(http.StatusOK, appResponse{
			ID:          updated.ID,
			Template:    updated.Template,
			Settings:    settings,
			Status:      updated.Status,
			ContainerID: updated.ContainerID,
			DeployedAt:  updated.DeployedAt,
			UpdatedAt:   updated.UpdatedAt,
		})
	}
}

func appConfigsHandler(deps Deps) gin.HandlerFunc {
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

		dataDir := deps.DataDir
		if dataDir == "" {
			dataDir = defaultDataDir
		}

		configDir := filepath.Join(dataDir, "apps", app.Template+"-"+app.ID[:8], "configs")

		var files []string
		err = filepath.Walk(configDir, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(configDir, path)
			files = append(files, rel)
			return nil
		})
		if err != nil {
			if os.IsNotExist(err) {
				c.JSON(http.StatusOK, []string{})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "read config dir: " + err.Error()})
			return
		}

		if files == nil {
			files = []string{}
		}
		c.JSON(http.StatusOK, files)
	}
}

func appConfigFileHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		// Support both :file param and *filepath wildcard
		filename := c.Param("file")
		if filename == "" {
			filename = c.Param("filepath")
		}
		// Gin wildcard includes leading "/"
		filename = strings.TrimPrefix(filename, "/")

		if filename == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file path required"})
			return
		}

		app, err := db.GetApp(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if app == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
			return
		}

		dataDir := deps.DataDir
		if dataDir == "" {
			dataDir = defaultDataDir
		}

		configBase := filepath.Join(dataDir, "apps", app.Template+"-"+app.ID[:8], "configs")
		configPath := filepath.Join(configBase, filename)

		// Prevent path traversal — file must be under the config directory
		absConfig, _ := filepath.Abs(configPath)
		absBase, _ := filepath.Abs(configBase)
		if !strings.HasPrefix(absConfig, absBase+string(filepath.Separator)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file path"})
			return
		}

		data, err := os.ReadFile(configPath)
		if err != nil {
			if os.IsNotExist(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "config file not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "read file: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"content": string(data)})
	}
}
