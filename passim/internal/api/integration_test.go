//go:build integration

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
)

// ---------- helpers ----------

// deployApp sends POST /api/apps and returns the parsed response.
func deployApp(t *testing.T, env *integEnv, token string, tmpl string, settings map[string]interface{}) map[string]interface{} {
	t.Helper()
	body, _ := json.Marshal(map[string]interface{}{
		"template": tmpl,
		"settings": settings,
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted && w.Code != http.StatusCreated {
		t.Fatalf("deploy: expected 201 or 202, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	return resp
}

// ---------- tests ----------

// TestInteg_AsyncDeployLifecycle tests the full async deploy flow:
// POST /api/apps -> 202 + task_id -> poll task -> completed -> app running.
func TestInteg_AsyncDeployLifecycle(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 1})

	// Should be 202 Accepted with task_id
	taskID, ok := resp["task_id"].(string)
	if !ok || taskID == "" {
		t.Fatalf("expected task_id in response, got %v", resp)
	}
	appID, ok := resp["id"].(string)
	if !ok || appID == "" {
		t.Fatal("expected id in response")
	}
	if resp["status"] != "deploying" {
		t.Errorf("expected status deploying, got %v", resp["status"])
	}

	// Poll task until completion
	tsk := waitForTask(t, env.DB, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("expected task completed, got %s: %s", tsk.Status, tsk.Result)
	}

	// Verify app via GET /api/apps/:id
	req := httptest.NewRequest("GET", "/api/apps/"+appID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get app: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var appResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &appResp)

	if appResp["status"] != "running" {
		t.Errorf("expected app status running, got %v", appResp["status"])
	}
	if appResp["container_id"] != "container-integ-001" {
		t.Errorf("expected container_id container-integ-001, got %v", appResp["container_id"])
	}

	// Verify MockDocker received Pull + Create calls
	hasPull, hasCreate := false, false
	for _, call := range mock.Calls {
		if call.Method == "PullImage" {
			hasPull = true
		}
		if call.Method == "CreateAndStartContainer" {
			hasCreate = true
		}
	}
	if !hasPull {
		t.Error("expected PullImage call on MockDocker")
	}
	if !hasCreate {
		t.Error("expected CreateAndStartContainer call on MockDocker")
	}
}

// TestInteg_AsyncDeployFailure tests that a Docker pull failure results
// in task retries and eventually a failed task/app status.
func TestInteg_AsyncDeployFailure(t *testing.T) {
	mock := &docker.MockClient{
		PullErr: io.ErrUnexpectedEOF,
	}
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 1})

	taskID := resp["task_id"].(string)
	appID := resp["id"].(string)

	// Wait for task to fail after retries
	tsk := waitForTask(t, env.DB, taskID, 15*time.Second)
	if tsk.Status != task.StatusFailed {
		t.Fatalf("expected task failed, got %s", tsk.Status)
	}
	if tsk.Retries < 1 {
		t.Errorf("expected at least 1 retry, got %d", tsk.Retries)
	}

	// App should not be running
	app, _ := db.GetApp(env.DB, appID)
	if app != nil && app.Status == "running" {
		t.Error("app should not be running after deploy failure")
	}
}

// TestInteg_AsyncUndeployLifecycle tests: deploy -> DELETE /api/apps/:id -> 202 ->
// task completes -> app deleted (404).
func TestInteg_AsyncUndeployLifecycle(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	// Deploy first
	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 1})
	deployTaskID := resp["task_id"].(string)
	appID := resp["id"].(string)

	// Wait for deploy to complete
	tsk := waitForTask(t, env.DB, deployTaskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("deploy task should complete, got %s: %s", tsk.Status, tsk.Result)
	}

	// DELETE /api/apps/:id
	req := httptest.NewRequest("DELETE", "/api/apps/"+appID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("delete: expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var delResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &delResp)
	undeployTaskID, ok := delResp["task_id"].(string)
	if !ok || undeployTaskID == "" {
		t.Fatal("expected task_id in delete response")
	}

	// Wait for undeploy task
	undeployTask := waitForTask(t, env.DB, undeployTaskID, 10*time.Second)
	if undeployTask.Status != task.StatusCompleted {
		t.Fatalf("undeploy task: expected completed, got %s: %s", undeployTask.Status, undeployTask.Result)
	}

	// Verify app is deleted -> GET returns 404
	req = httptest.NewRequest("GET", "/api/apps/"+appID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("get after undeploy: expected 404, got %d", w.Code)
	}
}

// TestInteg_AuthFlowComplete tests the full auth lifecycle:
// login -> use token -> refresh -> bump auth_version -> old token rejected.
func TestInteg_AuthFlowComplete(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)

	// 1. Login
	token := getToken(t, env.Handler, env.APIKey)

	// 2. GET /api/status with token -> 200
	req := httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status with valid token: expected 200, got %d", w.Code)
	}

	// 3. POST /api/auth/refresh -> new token
	refreshBody, _ := json.Marshal(map[string]string{"token": token})
	req = httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("refresh: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var refreshResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &refreshResp)
	newToken, ok := refreshResp["token"].(string)
	if !ok || newToken == "" {
		t.Fatal("expected new token from refresh")
	}

	// 4. Bump auth_version in DB to invalidate all existing tokens
	db.SetConfig(env.DB, "auth_version", "2")

	// 5. Old token should now be rejected -> 401
	req = httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("old token after version bump: expected 401, got %d", w.Code)
	}

	// 6. New token (same version 1) should also be rejected
	req = httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+newToken)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("refreshed token after version bump: expected 401, got %d", w.Code)
	}
}

// TestInteg_TokenQueryParamSSE tests that SSE endpoints accept tokens via query
// param and reject bad tokens.
func TestInteg_TokenQueryParamSSE(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	// Valid token via query param -> 200 with text/event-stream
	// The metrics stream handler blocks in an infinite loop, so we need to
	// use a cancellable context and run ServeHTTP in a goroutine.
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/api/metrics/stream?token="+token, nil).WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		env.Handler.ServeHTTP(w, req)
		close(done)
	}()

	// Give it a moment to write headers and initial data
	time.Sleep(200 * time.Millisecond)
	cancel()
	<-done

	if w.Code != http.StatusOK {
		t.Fatalf("SSE with valid token: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	ct := w.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Errorf("expected Content-Type text/event-stream, got %q", ct)
	}

	// Bad token -> 401 (this one returns immediately, no need for goroutine)
	req = httptest.NewRequest("GET", "/api/metrics/stream?token=invalidtoken", nil)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("SSE with bad token: expected 401, got %d", w.Code)
	}
}

// TestInteg_ContainerListWithApps tests: deploy app -> set MockDocker.Containers
// with matching container -> GET /api/containers returns it with passim labels.
func TestInteg_ContainerListWithApps(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	// Deploy
	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 1})
	taskID := resp["task_id"].(string)
	appID := resp["id"].(string)

	tsk := waitForTask(t, env.DB, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("deploy: %s: %s", tsk.Status, tsk.Result)
	}

	// Set MockDocker containers with passim labels
	mock.Containers = []container.Summary{
		{
			ID:    "container-integ-001",
			Names: []string{"/passim-wireguard-" + appID[:8]},
			State: "running",
			Labels: map[string]string{
				"io.passim.managed":      "true",
				"io.passim.app.id":       appID,
				"io.passim.app.template": "wireguard",
			},
		},
	}

	// GET /api/containers
	req := httptest.NewRequest("GET", "/api/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("containers: expected 200, got %d", w.Code)
	}

	var containers []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &containers)
	if len(containers) != 1 {
		t.Fatalf("expected 1 container, got %d", len(containers))
	}

	labels, _ := containers[0]["Labels"].(map[string]interface{})
	if labels["io.passim.managed"] != "true" {
		t.Error("expected io.passim.managed=true label")
	}
	if labels["io.passim.app.id"] != appID {
		t.Errorf("expected io.passim.app.id=%s, got %v", appID, labels["io.passim.app.id"])
	}
}

// TestInteg_TemplateToDockerConfig tests that deploying wireguard with peers=3
// produces the correct Docker config (image, env, ports).
func TestInteg_TemplateToDockerConfig(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 3})
	taskID := resp["task_id"].(string)

	tsk := waitForTask(t, env.DB, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("task: %s: %s", tsk.Status, tsk.Result)
	}

	// Find the CreateAndStartContainer call
	var cfg *docker.ContainerConfig
	for _, call := range mock.Calls {
		if call.Method == "CreateAndStartContainer" {
			cfg = call.Args[0].(*docker.ContainerConfig)
			break
		}
	}
	if cfg == nil {
		t.Fatal("CreateAndStartContainer was not called")
	}

	// Verify image
	if cfg.Image != "linuxserver/wireguard" {
		t.Errorf("image = %q, want linuxserver/wireguard", cfg.Image)
	}

	// Verify env includes PEERS=3
	hasPeers := false
	for _, e := range cfg.Env {
		if e == "PEERS=3" {
			hasPeers = true
		}
	}
	if !hasPeers {
		t.Errorf("expected PEERS=3 in env, got %v", cfg.Env)
	}

	// Verify ports include 51820:51820/udp
	hasPorts := false
	for _, p := range cfg.Ports {
		if p == "51820:51820/udp" {
			hasPorts = true
		}
	}
	if !hasPorts {
		t.Errorf("expected 51820:51820/udp in ports, got %v", cfg.Ports)
	}

	// Verify passim labels
	if cfg.Labels["io.passim.managed"] != "true" {
		t.Error("missing io.passim.managed label")
	}
	if cfg.Labels["io.passim.app.template"] != "wireguard" {
		t.Errorf("label io.passim.app.template = %q", cfg.Labels["io.passim.app.template"])
	}

	// Verify cap_add
	hasNetAdmin, hasSysModule := false, false
	for _, cap := range cfg.CapAdd {
		if cap == "NET_ADMIN" {
			hasNetAdmin = true
		}
		if cap == "SYS_MODULE" {
			hasSysModule = true
		}
	}
	if !hasNetAdmin {
		t.Error("expected NET_ADMIN in cap_add")
	}
	if !hasSysModule {
		t.Error("expected SYS_MODULE in cap_add")
	}
}

// TestInteg_AppSettingsUpdateValidation tests: deploy -> PATCH valid settings -> 200 ->
// PATCH out-of-range settings -> 400 -> GET confirms last valid value.
func TestInteg_AppSettingsUpdateValidation(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	// Deploy with peers=1
	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 1})
	taskID := resp["task_id"].(string)
	appID := resp["id"].(string)

	tsk := waitForTask(t, env.DB, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("deploy: %s: %s", tsk.Status, tsk.Result)
	}

	// PATCH with valid settings -> 200
	patchBody, _ := json.Marshal(map[string]interface{}{
		"settings": map[string]interface{}{"peers": 5},
	})
	req := httptest.NewRequest("PATCH", "/api/apps/"+appID, bytes.NewReader(patchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("valid patch: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// PATCH with out-of-range settings -> 400
	patchBody, _ = json.Marshal(map[string]interface{}{
		"settings": map[string]interface{}{"peers": 100}, // max is 25
	})
	req = httptest.NewRequest("PATCH", "/api/apps/"+appID, bytes.NewReader(patchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("out-of-range patch: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// GET to confirm last valid value (5) is preserved
	req = httptest.NewRequest("GET", "/api/apps/"+appID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get app: expected 200, got %d", w.Code)
	}
	var appResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &appResp)
	settings, _ := appResp["settings"].(map[string]interface{})
	if settings["peers"] != float64(5) {
		t.Errorf("expected peers=5 after rejected patch, got %v", settings["peers"])
	}
}

// TestInteg_TaskRecovery tests that a task stuck in "running" status in the DB
// gets recovered and processed when a new queue starts.
func TestInteg_TaskRecovery(t *testing.T) {
	// Set up a database and insert a task with status=running
	dbPath := filepath.Join(t.TempDir(), "recovery.db")
	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(dbPath)
	})

	dataDir := t.TempDir()
	t.Setenv("DATA_DIR", dataDir)

	mock := defaultMock()

	// Create an app record (the deploy handler expects it)
	app := &db.App{
		ID:       "recovery-app-1234567890",
		Template: "wireguard",
		Settings: `{"peers":1}`,
		Status:   "deploying",
	}
	if err := db.CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	// Insert a task directly in DB with status=running (simulating crash)
	stuckTask := &task.Task{
		ID:         "stuck-task-id-12345",
		Type:       "deploy",
		Target:     "recovery-app-1234567890",
		Payload:    fmt.Sprintf(`{"AppID":"recovery-app-1234567890","AppName":"wireguard","Image":"linuxserver/wireguard","Env":{"PEERS":"1"},"Ports":["51820:51820/udp"],"DataDir":"%s"}`, dataDir),
		Status:     task.StatusRunning, // stuck in running
		Retries:    0,
		MaxRetries: 3,
	}
	if err := task.Insert(database, stuckTask); err != nil {
		t.Fatal(err)
	}

	// Create a new Queue — Start should recover the stuck task
	q := task.NewQueue(database, 100)

	// Set up deps for task handlers
	secret, _ := db.GetConfig(database, "jwt_secret")
	if secret == "" {
		s, _ := auth.GenerateSecret()
		db.SetConfig(database, "jwt_secret", s)
		db.SetConfig(database, "api_key_hash", "dummy")
		db.SetConfig(database, "auth_version", "1")
		secret = s
	}
	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	deps := Deps{
		DB:     database,
		JWT:    jwtMgr,
		Docker: mock,
		SSE:    sse.NewBroker(),
		Tasks:  q,
	}
	RegisterTaskHandlers(q, deps)

	q.Start(1)
	t.Cleanup(func() { q.Stop() })

	// Wait for the recovered task to complete
	recovered := waitForTask(t, database, "stuck-task-id-12345", 10*time.Second)
	if recovered.Status != task.StatusCompleted {
		t.Fatalf("expected recovered task to complete, got %s: %s", recovered.Status, recovered.Result)
	}

	// Verify app is now running
	updatedApp, _ := db.GetApp(database, "recovery-app-1234567890")
	if updatedApp == nil {
		t.Fatal("app not found after recovery")
	}
	if updatedApp.Status != "running" {
		t.Errorf("expected app status running, got %s", updatedApp.Status)
	}
}

// TestInteg_ConcurrentDeploys tests that deploying 2 apps in parallel both complete
// successfully and the DB has 2 app records.
func TestInteg_ConcurrentDeploys(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	var wg sync.WaitGroup
	type result struct {
		appID  string
		taskID string
	}
	results := make([]result, 2)

	templates := []string{"wireguard", "webdav"}
	settingsList := []map[string]interface{}{
		{"peers": 1},
		{"username": "admin", "password": "testpass123"},
	}

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			resp := deployApp(t, env, token, templates[idx], settingsList[idx])
			results[idx] = result{
				appID:  resp["id"].(string),
				taskID: resp["task_id"].(string),
			}
		}(i)
	}
	wg.Wait()

	// Wait for both tasks to complete
	for i, r := range results {
		tsk := waitForTask(t, env.DB, r.taskID, 15*time.Second)
		if tsk.Status != task.StatusCompleted {
			t.Errorf("task %d (%s): expected completed, got %s: %s", i, r.taskID, tsk.Status, tsk.Result)
		}
	}

	// Verify DB has 2 app records
	apps, err := db.ListApps(env.DB)
	if err != nil {
		t.Fatal(err)
	}
	if len(apps) != 2 {
		t.Errorf("expected 2 apps in DB, got %d", len(apps))
	}
}

// TestInteg_AppConfigFiles tests: deploy app -> write config files to expected path ->
// GET /api/apps/:id/configs -> returns file list ->
// GET /api/apps/:id/configs/:file -> returns content.
func TestInteg_AppConfigFiles(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)
	token := getToken(t, env.Handler, env.APIKey)

	// Deploy wireguard (simple, no absolute config file paths that would fail)
	resp := deployApp(t, env, token, "wireguard", map[string]interface{}{"peers": 2})
	taskID := resp["task_id"].(string)
	appID := resp["id"].(string)

	tsk := waitForTask(t, env.DB, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("deploy wireguard: %s: %s", tsk.Status, tsk.Result)
	}

	// The configs endpoint reads from: $DATA_DIR/apps/{template}-{appID[:8]}/configs/
	// Simulate config files being present (as if the container generated them)
	configDir := filepath.Join(env.DataDir, "apps", "wireguard-"+appID[:8], "configs")
	os.MkdirAll(configDir, 0755)
	configContent := "[Interface]\nPrivateKey = abc123\nAddress = 10.0.0.1/24\n"
	os.WriteFile(filepath.Join(configDir, "peer1.conf"), []byte(configContent), 0644)
	os.WriteFile(filepath.Join(configDir, "peer2.conf"), []byte("[Peer]\nEndpoint = 1.2.3.4\n"), 0644)

	// GET /api/apps/:id/configs -> file list
	req := httptest.NewRequest("GET", "/api/apps/"+appID+"/configs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list configs: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var files []string
	json.Unmarshal(w.Body.Bytes(), &files)
	if len(files) != 2 {
		t.Fatalf("expected 2 config files, got %d: %v", len(files), files)
	}

	// GET /api/apps/:id/configs/peer1.conf -> content
	req = httptest.NewRequest("GET", "/api/apps/"+appID+"/configs/peer1.conf", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get config file: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var cfResp struct {
		Content string `json:"content"`
	}
	json.Unmarshal(w.Body.Bytes(), &cfResp)
	if cfResp.Content != configContent {
		t.Errorf("config content = %q, want %q", cfResp.Content, configContent)
	}

	// GET non-existent config -> 404
	req = httptest.NewRequest("GET", "/api/apps/"+appID+"/configs/nonexistent.conf", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("get nonexistent config: expected 404, got %d", w.Code)
	}
}

// TestInteg_CORSHeaders tests that CORS headers are present on both
// OPTIONS preflight and regular GET requests.
func TestInteg_CORSHeaders(t *testing.T) {
	mock := defaultMock()
	env := testServerIntegration(t, mock)

	// OPTIONS preflight request
	req := httptest.NewRequest("OPTIONS", "/api/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "GET")
	w := httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("OPTIONS: expected 204, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("OPTIONS: missing Access-Control-Allow-Origin header")
	}
	if w.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("OPTIONS: missing Access-Control-Allow-Methods header")
	}
	if w.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Error("OPTIONS: missing Access-Control-Allow-Headers header")
	}

	// GET /api/status with auth -> verify CORS headers present on response
	token := getToken(t, env.Handler, env.APIKey)
	req = httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "http://localhost:3000")
	w = httptest.NewRecorder()
	env.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/status: expected 200, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("GET: missing Access-Control-Allow-Origin header")
	}
}
