package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/passim/passim/internal/docker"
	tmpl "github.com/passim/passim/internal/template"
)

func setupAppTest(t *testing.T) (http.Handler, string, *docker.MockClient) {
	t.Helper()

	reg := tmpl.NewRegistry()
	dir := t.TempDir()
	yamlContent := `
name: testapp
category: test
version: 1.0.0
icon: test
description:
  en-US: "Test app"
settings:
  - key: count
    type: number
    min: 1
    max: 10
    default: 2
    label:
      en-US: "Count"
container:
  image: test/image:latest
  ports:
    - "8080:80"
  volumes:
    - "/data/test:/app"
  environment:
    COUNT: "{{settings.count}}"
  labels:
    io.passim: test
`
	os.WriteFile(filepath.Join(dir, "testapp.yaml"), []byte(yamlContent), 0644)
	if err := reg.LoadDir(dir); err != nil {
		t.Fatal(err)
	}

	mock := &docker.MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "mock-ctr-001",
	}

	// Set DATA_DIR to temp so config files don't go to /data
	dataDir := t.TempDir()
	t.Setenv("DATA_DIR", dataDir)

	router, _, apiKey := testServerFull(t, mock, reg)
	return router, apiKey, mock
}

func TestDeployApp(t *testing.T) {
	router, apiKey, mock := setupAppTest(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"settings": map[string]interface{}{"count": 5},
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp appResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.ID == "" {
		t.Error("empty ID")
	}
	if resp.Template != "testapp" {
		t.Errorf("template = %q", resp.Template)
	}
	if resp.Status != "running" {
		t.Errorf("status = %q", resp.Status)
	}
	if resp.ContainerID != "mock-ctr-001" {
		t.Errorf("container_id = %q", resp.ContainerID)
	}

	// Verify Docker calls
	hasPull := false
	hasCreate := false
	for _, call := range mock.Calls {
		if call.Method == "PullImage" {
			hasPull = true
		}
		if call.Method == "CreateAndStartContainer" {
			hasCreate = true
			cfg := call.Args[0].(*docker.ContainerConfig)
			if cfg.Image != "test/image:latest" {
				t.Errorf("image = %q", cfg.Image)
			}
		}
	}
	if !hasPull {
		t.Error("PullImage not called")
	}
	if !hasCreate {
		t.Error("CreateAndStartContainer not called")
	}
}

func TestDeployApp_TemplateNotFound(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "nonexistent",
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestDeployApp_InvalidSettings(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"settings": map[string]interface{}{"count": 100}, // max is 10
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeployApp_DefaultSettings(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		// no settings — should use defaults
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp appResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Settings["count"] != float64(2) {
		t.Errorf("count = %v, want 2", resp.Settings["count"])
	}
}

func TestListApps_Empty(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/apps", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var apps []appResponse
	json.Unmarshal(w.Body.Bytes(), &apps)
	if len(apps) != 0 {
		t.Errorf("expected empty list, got %d", len(apps))
	}
}

func TestAppLifecycle(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	// Deploy
	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"settings": map[string]interface{}{"count": 3},
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("deploy: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var deployed appResponse
	json.Unmarshal(w.Body.Bytes(), &deployed)

	// Get
	req = httptest.NewRequest("GET", "/api/apps/"+deployed.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", w.Code)
	}

	// List
	req = httptest.NewRequest("GET", "/api/apps", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", w.Code)
	}
	var apps []appResponse
	json.Unmarshal(w.Body.Bytes(), &apps)
	if len(apps) != 1 {
		t.Fatalf("list: expected 1, got %d", len(apps))
	}

	// Update settings
	body, _ = json.Marshal(map[string]interface{}{
		"settings": map[string]interface{}{"count": 7},
	})
	req = httptest.NewRequest("PATCH", "/api/apps/"+deployed.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated appResponse
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Settings["count"] != float64(7) {
		t.Errorf("count = %v, want 7", updated.Settings["count"])
	}

	// Delete
	req = httptest.NewRequest("DELETE", "/api/apps/"+deployed.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", w.Code)
	}

	// Verify deleted
	req = httptest.NewRequest("GET", "/api/apps/"+deployed.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("get after delete: expected 404, got %d", w.Code)
	}
}

func TestGetApp_NotFound(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/apps/nonexistent-id", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestAppConfigs(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	// Deploy an app first
	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var deployed appResponse
	json.Unmarshal(w.Body.Bytes(), &deployed)

	// Write a config file manually
	dataDir := os.Getenv("DATA_DIR")
	configDir := filepath.Join(dataDir, "apps", "testapp-"+deployed.ID[:8], "configs")
	os.MkdirAll(configDir, 0755)
	os.WriteFile(filepath.Join(configDir, "test.conf"), []byte("config content"), 0644)

	// List configs
	req = httptest.NewRequest("GET", "/api/apps/"+deployed.ID+"/configs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list configs: expected 200, got %d", w.Code)
	}
	var files []string
	json.Unmarshal(w.Body.Bytes(), &files)
	if len(files) != 1 || files[0] != "test.conf" {
		t.Errorf("files = %v", files)
	}

	// Get config file
	req = httptest.NewRequest("GET", "/api/apps/"+deployed.ID+"/configs/test.conf", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get config: expected 200, got %d", w.Code)
	}
	if w.Body.String() != "config content" {
		t.Errorf("body = %q", w.Body.String())
	}
}

func TestAppConfigs_NoConfigs(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	// Deploy an app
	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var deployed appResponse
	json.Unmarshal(w.Body.Bytes(), &deployed)

	// List configs (no config dir should exist)
	req = httptest.NewRequest("GET", "/api/apps/"+deployed.ID+"/configs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestDeployApp_NoAuth(t *testing.T) {
	router, _, _ := setupAppTest(t)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestDeleteApp_NotFound(t *testing.T) {
	router, apiKey, _ := setupAppTest(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/apps/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

// Helper: insert an app directly into DB for tests that don't need full deploy
func insertTestApp(t *testing.T, database interface{}) {
	t.Helper()
	// For tests that need DB access, this is done through the API
}
