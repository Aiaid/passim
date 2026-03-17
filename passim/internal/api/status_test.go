package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestStatus_ReturnsFullStructure(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	mockDocker.Containers = []container.Summary{
		{ID: "c1", State: "running", Names: []string{"/app1"}},
		{ID: "c2", State: "running", Names: []string{"/app2"}},
		{ID: "c3", State: "exited", Names: []string{"/app3"}},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp statusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Node.Version == "" {
		t.Error("expected non-empty version")
	}
	if resp.System.Memory.TotalBytes == 0 {
		t.Error("expected non-zero memory total")
	}
	if resp.System.CPU.Cores == 0 {
		t.Error("expected non-zero CPU cores")
	}
	if resp.Containers.Total != 3 {
		t.Errorf("expected 3 total containers, got %d", resp.Containers.Total)
	}
	if resp.Containers.Running != 2 {
		t.Errorf("expected 2 running, got %d", resp.Containers.Running)
	}
}

func TestStatus_NoDocker(t *testing.T) {
	handler, _, apiKey := testServerNoDocker(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp statusResponse
	json.NewDecoder(w.Body).Decode(&resp)

	if resp.Containers.Total != 0 {
		t.Errorf("expected 0 total containers, got %d", resp.Containers.Total)
	}
}
