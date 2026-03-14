//go:build e2e

package api

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/passim/passim/internal/task"
)

func TestE2E_LoginAndProtectedRoute(t *testing.T) {
	baseURL, apiKey, _, _, cleanup := startE2EServer(t)
	defer cleanup()

	// Login with valid API key
	token := e2eLogin(t, baseURL, apiKey)
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// GET /api/status with valid token should succeed
	resp := e2eRequest(t, "GET", baseURL+"/api/status", token, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(body))
	}

	// Verify response contains expected structure
	var status map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if _, ok := status["node"]; !ok {
		t.Error("status response missing 'node' field")
	}
	if _, ok := status["system"]; !ok {
		t.Error("status response missing 'system' field")
	}

	// GET /api/status without token should return 401
	resp2 := e2eRequest(t, "GET", baseURL+"/api/status", "", nil)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", resp2.StatusCode)
	}
}

func TestE2E_SSEMetricsStream(t *testing.T) {
	baseURL, apiKey, _, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	// Use context with timeout for the SSE stream
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/api/metrics/stream?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("metrics stream request failed: %v", err)
	}
	defer resp.Body.Close()

	// Verify Content-Type
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("expected Content-Type text/event-stream, got %s", ct)
	}

	// Read at least one SSE event with bufio.Scanner
	scanner := bufio.NewScanner(resp.Body)
	var foundEvent, foundData bool
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: metrics") {
			foundEvent = true
		}
		if strings.HasPrefix(line, "data:") {
			foundData = true
		}
		if foundEvent && foundData {
			break
		}
	}

	if !foundEvent {
		t.Error("did not find 'event: metrics' line in SSE stream")
	}
	if !foundData {
		t.Error("did not find 'data:' line in SSE stream")
	}
}

func TestE2E_SSETaskEvents(t *testing.T) {
	baseURL, apiKey, database, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	// Deploy an app to create a task
	deployBody := map[string]interface{}{
		"template": "wireguard",
		"settings": map[string]interface{}{"peers": 1},
	}
	resp := e2eRequest(t, "POST", baseURL+"/api/apps", token, deployBody)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 202, got %d: %s", resp.StatusCode, string(body))
	}

	var deployResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&deployResp)

	taskID, ok := deployResp["task_id"].(string)
	if !ok || taskID == "" {
		t.Fatal("deploy response missing task_id")
	}

	// Open SSE stream for task events
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/api/tasks/"+taskID+"/events?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}

	client := &http.Client{}
	sseResp, err := client.Do(req)
	if err != nil {
		t.Fatalf("task events request failed: %v", err)
	}
	defer sseResp.Body.Close()

	ct := sseResp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("expected text/event-stream, got %s", ct)
	}

	// Wait for the task to complete
	tsk := waitForTask(t, database, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("expected task completed, got %s: %s", tsk.Status, tsk.Result)
	}
}

func TestE2E_DeployAndListApps(t *testing.T) {
	baseURL, apiKey, database, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	// 1. Deploy a wireguard app
	deployBody := map[string]interface{}{
		"template": "wireguard",
		"settings": map[string]interface{}{"peers": 1},
	}
	resp := e2eRequest(t, "POST", baseURL+"/api/apps", token, deployBody)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 202 Accepted, got %d: %s", resp.StatusCode, string(body))
	}

	var deployResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&deployResp)

	appID, ok := deployResp["id"].(string)
	if !ok || appID == "" {
		t.Fatal("deploy response missing id")
	}
	taskID := deployResp["task_id"].(string)
	if taskID == "" {
		t.Fatal("deploy response missing task_id")
	}

	// 2. Wait for deploy task to complete
	tsk := waitForTask(t, database, taskID, 10*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("deploy task failed: %s: %s", tsk.Status, tsk.Result)
	}

	// 3. GET /api/apps — verify list contains the app
	resp2 := e2eRequest(t, "GET", baseURL+"/api/apps", token, nil)
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("list apps: expected 200, got %d", resp2.StatusCode)
	}

	var apps []map[string]interface{}
	json.NewDecoder(resp2.Body).Decode(&apps)

	found := false
	for _, a := range apps {
		if a["id"] == appID {
			found = true
			if a["template"] != "wireguard" {
				t.Errorf("expected template wireguard, got %v", a["template"])
			}
			if a["status"] != "running" {
				t.Errorf("expected status running, got %v", a["status"])
			}
			break
		}
	}
	if !found {
		t.Fatalf("app %s not found in list of %d apps", appID, len(apps))
	}

	// 4. GET /api/apps/:id — verify details
	resp3 := e2eRequest(t, "GET", baseURL+"/api/apps/"+appID, token, nil)
	defer resp3.Body.Close()

	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("get app: expected 200, got %d", resp3.StatusCode)
	}

	var appDetail map[string]interface{}
	json.NewDecoder(resp3.Body).Decode(&appDetail)

	if appDetail["id"] != appID {
		t.Errorf("expected id %s, got %v", appID, appDetail["id"])
	}
	if appDetail["template"] != "wireguard" {
		t.Errorf("expected template wireguard, got %v", appDetail["template"])
	}

	// 5. DELETE /api/apps/:id
	resp4 := e2eRequest(t, "DELETE", baseURL+"/api/apps/"+appID, token, nil)
	defer resp4.Body.Close()

	if resp4.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp4.Body)
		t.Fatalf("delete app: expected 202, got %d: %s", resp4.StatusCode, string(body))
	}

	var deleteResp map[string]interface{}
	json.NewDecoder(resp4.Body).Decode(&deleteResp)

	deleteTaskID, ok := deleteResp["task_id"].(string)
	if !ok || deleteTaskID == "" {
		t.Fatal("delete response missing task_id")
	}

	// 6. Wait for undeploy task to complete
	deleteTsk := waitForTask(t, database, deleteTaskID, 10*time.Second)
	if deleteTsk.Status != task.StatusCompleted {
		t.Fatalf("undeploy task failed: %s: %s", deleteTsk.Status, deleteTsk.Result)
	}

	// 7. GET /api/apps/:id — should be 404
	resp5 := e2eRequest(t, "GET", baseURL+"/api/apps/"+appID, token, nil)
	defer resp5.Body.Close()

	if resp5.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", resp5.StatusCode)
	}
}

func TestE2E_ContainerCRUD(t *testing.T) {
	baseURL, apiKey, _, mock, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	// Set up mock containers
	mock.Containers = []container.Summary{
		{
			ID:    "container-1",
			Names: []string{"/test-container"},
			State: "running",
		},
		{
			ID:    "container-2",
			Names: []string{"/stopped-container"},
			State: "exited",
		},
	}

	// 1. GET /api/containers — list
	resp := e2eRequest(t, "GET", baseURL+"/api/containers", token, nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list containers: expected 200, got %d", resp.StatusCode)
	}

	var containers []map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&containers)
	if len(containers) != 2 {
		t.Fatalf("expected 2 containers, got %d", len(containers))
	}

	// 2. POST /containers/:id/start
	resp2 := e2eRequest(t, "POST", baseURL+"/api/containers/container-1/start", token, nil)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("start container: expected 200, got %d", resp2.StatusCode)
	}

	// 3. POST /containers/:id/stop
	resp3 := e2eRequest(t, "POST", baseURL+"/api/containers/container-1/stop", token, nil)
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("stop container: expected 200, got %d", resp3.StatusCode)
	}

	// 4. POST /containers/:id/restart
	resp4 := e2eRequest(t, "POST", baseURL+"/api/containers/container-1/restart", token, nil)
	defer resp4.Body.Close()
	if resp4.StatusCode != http.StatusOK {
		t.Fatalf("restart container: expected 200, got %d", resp4.StatusCode)
	}

	// 5. GET /containers/:id/logs
	mock.LogsReader = io.NopCloser(strings.NewReader("test log output\n"))
	resp5 := e2eRequest(t, "GET", baseURL+"/api/containers/container-1/logs", token, nil)
	defer resp5.Body.Close()
	if resp5.StatusCode != http.StatusOK {
		t.Fatalf("container logs: expected 200, got %d", resp5.StatusCode)
	}
	logsBody, _ := io.ReadAll(resp5.Body)
	if !strings.Contains(string(logsBody), "test log output") {
		t.Errorf("expected log output to contain 'test log output', got %q", string(logsBody))
	}

	// 6. DELETE /containers/:id
	resp6 := e2eRequest(t, "DELETE", baseURL+"/api/containers/container-2", token, nil)
	defer resp6.Body.Close()
	if resp6.StatusCode != http.StatusOK {
		t.Fatalf("remove container: expected 200, got %d", resp6.StatusCode)
	}

	// Verify mock recorded the expected calls
	callMethods := make(map[string]int)
	for _, call := range mock.Calls {
		callMethods[call.Method]++
	}
	if callMethods["StartContainer"] < 1 {
		t.Error("expected at least one StartContainer call")
	}
	if callMethods["StopContainer"] < 1 {
		t.Error("expected at least one StopContainer call")
	}
	if callMethods["RestartContainer"] < 1 {
		t.Error("expected at least one RestartContainer call")
	}
	if callMethods["RemoveContainer"] < 1 {
		t.Error("expected at least one RemoveContainer call")
	}
	if callMethods["ContainerLogs"] < 1 {
		t.Error("expected at least one ContainerLogs call")
	}
}

func TestE2E_TemplateList(t *testing.T) {
	baseURL, apiKey, _, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	resp := e2eRequest(t, "GET", baseURL+"/api/templates", token, nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("list templates: expected 200, got %d: %s", resp.StatusCode, string(body))
	}

	var templates []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}

	if len(templates) != 7 {
		t.Fatalf("expected 7 templates, got %d", len(templates))
	}

	// Verify each template has required fields
	for _, tmpl := range templates {
		name, ok := tmpl["name"].(string)
		if !ok || name == "" {
			t.Error("template missing name")
		}
		category, ok := tmpl["category"].(string)
		if !ok || category == "" {
			t.Errorf("template %s missing category", name)
		}
		settings, ok := tmpl["settings"]
		if !ok || settings == nil {
			t.Errorf("template %s missing settings", name)
		}
	}
}

func TestE2E_ConcurrentRequests(t *testing.T) {
	baseURL, apiKey, _, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	const numRequests = 10
	var wg sync.WaitGroup
	errors := make(chan error, numRequests)

	for i := 0; i < numRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			req, err := http.NewRequest("GET", baseURL+"/api/status", nil)
			if err != nil {
				errors <- err
				return
			}
			req.Header.Set("Authorization", "Bearer "+token)

			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				errors <- err
				return
			}
			defer resp.Body.Close()

			// Drain body
			io.ReadAll(resp.Body)

			if resp.StatusCode != http.StatusOK {
				errors <- &httpError{code: resp.StatusCode}
				return
			}
		}()
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Errorf("concurrent request failed: %v", err)
	}
}

// httpError is a simple error type for reporting HTTP status code failures.
type httpError struct {
	code int
}

func (e *httpError) Error() string {
	return http.StatusText(e.code)
}

func TestE2E_InvalidJSON(t *testing.T) {
	baseURL, apiKey, _, _, cleanup := startE2EServer(t)
	defer cleanup()

	token := e2eLogin(t, baseURL, apiKey)

	// 1. POST /api/apps with invalid JSON
	resp := e2eRequest(t, "POST", baseURL+"/api/apps", token, `{invalid json`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid JSON: expected 400, got %d", resp.StatusCode)
	}

	// 2. POST /api/apps with empty object (missing required template field)
	resp2 := e2eRequest(t, "POST", baseURL+"/api/apps", token, `{}`)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing template: expected 400, got %d", resp2.StatusCode)
	}

	// 3. POST /api/auth/login with empty body
	resp3 := e2eRequest(t, "POST", baseURL+"/api/auth/login", "", `{}`)
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty login body: expected 400, got %d", resp3.StatusCode)
	}
}
