package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestListContainers(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	mockDocker.Containers = []container.Summary{
		{ID: "c1", State: "running", Names: []string{"/web"}},
		{ID: "c2", State: "exited", Names: []string{"/db"}},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var containers []container.Summary
	json.NewDecoder(w.Body).Decode(&containers)
	if len(containers) != 2 {
		t.Errorf("expected 2 containers, got %d", len(containers))
	}
}

func TestListContainers_DockerUnavailable(t *testing.T) {
	handler, _, apiKey := testServerNoDocker(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodGet, "/api/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestListContainers_DockerError(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)
	mockDocker.ListErr = errors.New("docker error")

	req := httptest.NewRequest(http.MethodGet, "/api/containers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestStartContainer(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodPost, "/api/containers/abc123/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	found := false
	for _, call := range mockDocker.Calls {
		if call.Method == "StartContainer" && len(call.Args) > 0 && call.Args[0] == "abc123" {
			found = true
		}
	}
	if !found {
		t.Error("expected StartContainer call with id abc123")
	}
}

func TestStopContainer(t *testing.T) {
	handler, _, apiKey, _ := testServer(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodPost, "/api/containers/abc123/stop", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRestartContainer(t *testing.T) {
	handler, _, apiKey, _ := testServer(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodPost, "/api/containers/abc123/restart", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRemoveContainer(t *testing.T) {
	handler, _, apiKey, _ := testServer(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodDelete, "/api/containers/abc123", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestContainerLogs(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	logContent := "2024-01-01 hello world\n"
	mockDocker.LogsReader = io.NopCloser(strings.NewReader(logContent))

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc123/logs?lines=50", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	ct := w.Header().Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("expected application/json, got %s", ct)
	}

	var result struct{ Logs string }
	json.NewDecoder(w.Body).Decode(&result)
	if result.Logs != logContent {
		t.Errorf("expected %q, got %q", logContent, result.Logs)
	}
}

func TestContainers_RequireAuth(t *testing.T) {
	handler, _, _, _ := testServer(t)

	endpoints := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/containers"},
		{http.MethodPost, "/api/containers/abc/start"},
		{http.MethodPost, "/api/containers/abc/stop"},
		{http.MethodPost, "/api/containers/abc/restart"},
		{http.MethodDelete, "/api/containers/abc"},
		{http.MethodGet, "/api/containers/abc/logs"},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", w.Code)
			}
		})
	}
}
