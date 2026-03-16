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
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/node"
)

// mockNodeHub is a test double for the NodeHub interface.
type mockNodeHub struct {
	nodes       map[string]*node.NodeInfo
	proxyStatus int
	proxyBody   []byte
	proxyErr    error
	addErr      error
}

func newMockNodeHub() *mockNodeHub {
	return &mockNodeHub{
		nodes: make(map[string]*node.NodeInfo),
	}
}

func (m *mockNodeHub) AddNode(_ context.Context, address, apiKey, name string) (*node.NodeInfo, error) {
	if m.addErr != nil {
		return nil, m.addErr
	}
	id := fmt.Sprintf("node-%d", len(m.nodes)+1)
	info := &node.NodeInfo{
		ID:        id,
		Name:      name,
		Address:   address,
		Status:    "connecting",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	m.nodes[id] = info
	return info, nil
}

func (m *mockNodeHub) RemoveNode(id string) error {
	if _, ok := m.nodes[id]; !ok {
		return fmt.Errorf("node %s not found", id)
	}
	delete(m.nodes, id)
	return nil
}

func (m *mockNodeHub) UpdateNode(id, name string) error {
	n, ok := m.nodes[id]
	if !ok {
		return fmt.Errorf("node %s not found", id)
	}
	n.Name = name
	return nil
}

func (m *mockNodeHub) ListNodes() []node.NodeInfo {
	result := make([]node.NodeInfo, 0, len(m.nodes))
	for _, n := range m.nodes {
		result = append(result, *n)
	}
	return result
}

func (m *mockNodeHub) GetNode(id string) (*node.NodeInfo, error) {
	n, ok := m.nodes[id]
	if !ok {
		return nil, fmt.Errorf("node %s not found", id)
	}
	return n, nil
}

func (m *mockNodeHub) ProxyRequest(_ context.Context, nodeID, method, path string, body io.Reader) (int, []byte, error) {
	if m.proxyErr != nil {
		return 0, nil, m.proxyErr
	}
	if _, ok := m.nodes[nodeID]; !ok {
		return 0, nil, fmt.Errorf("node %s not found", nodeID)
	}
	return m.proxyStatus, m.proxyBody, nil
}

// testServerWithNodeHub creates a test server with a mock NodeHub.
func testServerWithNodeHub(t *testing.T, hub NodeHub) (http.Handler, string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")
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

	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	router := NewRouter(Deps{DB: database, JWT: jwtMgr, NodeHub: hub})
	return router, plain
}

func TestAddNode(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{
		"address": "192.168.1.100:8443",
		"api_key": "test-remote-key",
		"name":    "my-server",
	})
	req := httptest.NewRequest("POST", "/api/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp node.NodeInfo
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.ID == "" {
		t.Error("empty ID")
	}
	if resp.Name != "my-server" {
		t.Errorf("name = %q, want %q", resp.Name, "my-server")
	}
	if resp.Address != "192.168.1.100:8443" {
		t.Errorf("address = %q", resp.Address)
	}
	if resp.Status != "connecting" {
		t.Errorf("status = %q", resp.Status)
	}
}

func TestAddNode_InvalidBody(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{
		"name": "missing-required-fields",
	})
	req := httptest.NewRequest("POST", "/api/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAddNode_HubError(t *testing.T) {
	hub := newMockNodeHub()
	hub.addErr = fmt.Errorf("connection refused")
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{
		"address": "bad-host:8443",
		"api_key": "key",
	})
	req := httptest.NewRequest("POST", "/api/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadGateway {
		t.Errorf("expected 502, got %d", w.Code)
	}
}

func TestListNodes_Empty(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var nodes []node.NodeInfo
	json.Unmarshal(w.Body.Bytes(), &nodes)
	if len(nodes) != 0 {
		t.Errorf("expected empty list, got %d", len(nodes))
	}
}

func TestListNodes_WithNodes(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{
		ID: "node-1", Name: "server-1", Address: "10.0.0.1:8443", Status: "connected",
	}
	hub.nodes["node-2"] = &node.NodeInfo{
		ID: "node-2", Name: "server-2", Address: "10.0.0.2:8443", Status: "disconnected",
	}

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var nodes []node.NodeInfo
	json.Unmarshal(w.Body.Bytes(), &nodes)
	if len(nodes) != 2 {
		t.Errorf("expected 2 nodes, got %d", len(nodes))
	}
}

func TestListNodes_NilHub(t *testing.T) {
	router, apiKey := testServerWithNodeHub(t, nil)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var nodes []node.NodeInfo
	json.Unmarshal(w.Body.Bytes(), &nodes)
	if len(nodes) != 0 {
		t.Errorf("expected empty list, got %d", len(nodes))
	}
}

func TestDeleteNode(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{
		ID: "node-1", Name: "server-1", Address: "10.0.0.1:8443",
	}

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/nodes/node-1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if len(hub.nodes) != 0 {
		t.Errorf("expected 0 nodes, got %d", len(hub.nodes))
	}
}

func TestDeleteNode_NotFound(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/nodes/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestUpdateNode(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{
		ID: "node-1", Name: "old-name", Address: "10.0.0.1:8443",
	}

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{"name": "new-name"})
	req := httptest.NewRequest("PATCH", "/api/nodes/node-1", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if hub.nodes["node-1"].Name != "new-name" {
		t.Errorf("name = %q, want %q", hub.nodes["node-1"].Name, "new-name")
	}
}

func TestUpdateNode_NotFound(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{"name": "new-name"})
	req := httptest.NewRequest("PATCH", "/api/nodes/nonexistent", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestUpdateNode_InvalidBody(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{
		ID: "node-1", Name: "old-name",
	}

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	// Missing required "name" field
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest("PATCH", "/api/nodes/node-1", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestNodeProxy_Success(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{
		ID: "node-1", Name: "server-1", Address: "10.0.0.1:8443",
	}
	hub.proxyStatus = http.StatusOK
	hub.proxyBody = []byte(`{"hostname":"remote-server","uptime":3600}`)

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/node-1/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("content-type = %q", w.Header().Get("Content-Type"))
	}
}

func TestNodeProxy_NodeNotFound(t *testing.T) {
	hub := newMockNodeHub()

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/nonexistent/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadGateway {
		t.Errorf("expected 502, got %d", w.Code)
	}
}

func TestNodeProxy_Error(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1"}
	hub.proxyErr = fmt.Errorf("connection refused")

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/node-1/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadGateway {
		t.Errorf("expected 502, got %d", w.Code)
	}
}

func TestNodeProxy_Containers(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1"}
	hub.proxyStatus = http.StatusOK
	hub.proxyBody = []byte(`[{"name":"nginx","state":"running"}]`)

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/node-1/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestNodeProxy_Apps(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1"}
	hub.proxyStatus = http.StatusOK
	hub.proxyBody = []byte(`[]`)

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/node-1/apps", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestNodeProxy_DeleteApp(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1"}
	hub.proxyStatus = http.StatusOK
	hub.proxyBody = []byte(`{"status":"deleted"}`)

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/nodes/node-1/apps/app-123", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestNodeProxy_NilHub(t *testing.T) {
	router, apiKey := testServerWithNodeHub(t, nil)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/nodes/node-1/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestBatchDeploy_NoTargets(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"targets":  []string{},
	})
	req := httptest.NewRequest("POST", "/api/batch/deploy", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestBatchDeploy_RemoteTarget(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1", Name: "remote-server"}
	hub.proxyStatus = http.StatusAccepted
	hub.proxyBody = []byte(`{"id":"app-1","status":"deploying","task_id":"task-123"}`)

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"settings": map[string]interface{}{},
		"targets":  []string{"node-1"},
	})
	req := httptest.NewRequest("POST", "/api/batch/deploy", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp batchDeployResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Deployments) != 1 {
		t.Fatalf("expected 1 deployment, got %d", len(resp.Deployments))
	}
	if resp.Deployments[0].Target != "node-1" {
		t.Errorf("target = %q", resp.Deployments[0].Target)
	}
	if resp.Deployments[0].Status != "queued" {
		t.Errorf("status = %q", resp.Deployments[0].Status)
	}
	if resp.Deployments[0].TaskID != "task-123" {
		t.Errorf("task_id = %q", resp.Deployments[0].TaskID)
	}
}

func TestBatchDeploy_RemoteError(t *testing.T) {
	hub := newMockNodeHub()
	hub.nodes["node-1"] = &node.NodeInfo{ID: "node-1"}
	hub.proxyErr = fmt.Errorf("connection refused")

	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]interface{}{
		"template": "testapp",
		"targets":  []string{"node-1"},
	})
	req := httptest.NewRequest("POST", "/api/batch/deploy", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp batchDeployResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Deployments) != 1 {
		t.Fatalf("expected 1 deployment, got %d", len(resp.Deployments))
	}
	if resp.Deployments[0].Status != "failed" {
		t.Errorf("status = %q", resp.Deployments[0].Status)
	}
	if resp.Deployments[0].Error == "" {
		t.Error("expected error message")
	}
}

func TestConnections_Empty(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/connections", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestDisconnect_NotImplemented(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/connections/some-id", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", w.Code)
	}
}

func TestNodeHandlers_NoAuth(t *testing.T) {
	hub := newMockNodeHub()
	router, _ := testServerWithNodeHub(t, hub)

	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/nodes"},
		{"POST", "/api/nodes"},
		{"DELETE", "/api/nodes/node-1"},
		{"PATCH", "/api/nodes/node-1"},
		{"GET", "/api/nodes/node-1/status"},
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401, got %d", ep.method, ep.path, w.Code)
		}
	}
}
