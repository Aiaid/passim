package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestContainerLogs_FollowSSE(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	// TTY-mode container: raw bytes, no stdcopy header. Two chunks so we can
	// verify each is emitted as its own SSE `event: log` frame.
	mockDocker.InspectResult.Config = &container.Config{Tty: true}
	r, w := io.Pipe()
	mockDocker.LogsReader = r
	go func() {
		_, _ = w.Write([]byte("first chunk\n"))
		_, _ = w.Write([]byte("\x1b[31mred\x1b[0m\n"))
		_ = w.Close()
	}()

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc123/logs?follow=1&lines=10", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Errorf("expected text/event-stream, got %s", ct)
	}

	body := rec.Body.String()
	expected := []string{
		"event: log\ndata: " + base64.StdEncoding.EncodeToString([]byte("first chunk\n")) + "\n\n",
		"event: log\ndata: " + base64.StdEncoding.EncodeToString([]byte("\x1b[31mred\x1b[0m\n")) + "\n\n",
	}
	for _, want := range expected {
		if !strings.Contains(body, want) {
			t.Errorf("SSE body missing chunk:\nwant: %q\nbody: %q", want, body)
		}
	}

	// ContainerLogsFollow must have been invoked (non-follow path would call ContainerLogs).
	found := false
	for _, call := range mockDocker.GetCalls() {
		if call.Method == "ContainerLogsFollow" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected ContainerLogsFollow to be called, calls=%+v", mockDocker.GetCalls())
	}
}

func TestContainerLogs_FollowSSE_Multiplexed(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	// Non-TTY container: Docker wraps each frame with an 8-byte header.
	// stdout = stream type 1.
	mockDocker.InspectResult.Config = &container.Config{Tty: false}
	payload := []byte("hello\n")
	frame := []byte{1, 0, 0, 0, 0, 0, 0, byte(len(payload))}
	frame = append(frame, payload...)
	mockDocker.LogsReader = io.NopCloser(strings.NewReader(string(frame)))

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc123/logs?follow=1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	want := "event: log\ndata: " + base64.StdEncoding.EncodeToString(payload) + "\n\n"
	if !strings.Contains(rec.Body.String(), want) {
		t.Errorf("expected demuxed chunk in SSE body, want %q, got %q", want, rec.Body.String())
	}
}

func TestContainerLogs_FollowSSE_FollowError(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	mockDocker.InspectResult.Config = &container.Config{Tty: true}
	mockDocker.LogsErr = errors.New("docker unreachable")

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc123/logs?follow=1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when follow reader errors, got %d body=%s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); strings.Contains(ct, "text/event-stream") {
		t.Errorf("SSE headers should not be written on pre-stream error, got %s", ct)
	}
}

func TestContainerLogs_FollowSSE_Keepalive(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	// Speed up the keepalive so the test finishes quickly.
	orig := sseKeepaliveInterval
	sseKeepaliveInterval = 10 * time.Millisecond
	defer func() { sseKeepaliveInterval = orig }()

	mockDocker.InspectResult.Config = &container.Config{Tty: true}
	// A pipe that stays open without any data lets the keepalive ticker fire
	// a few times; we close it after a short delay so the handler returns.
	r, w := io.Pipe()
	mockDocker.LogsReader = r
	go func() {
		time.Sleep(60 * time.Millisecond)
		_ = w.Close()
	}()

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc123/logs?follow=1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), ": ping\n\n") {
		t.Errorf("expected keepalive comment in SSE body, got %q", rec.Body.String())
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
