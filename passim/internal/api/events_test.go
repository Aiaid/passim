package api

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/passim/passim/internal/sse"
)

func TestMetricsStream(t *testing.T) {
	router, _, apiKey, _ := testServer(t)
	token := getToken(t, router, apiKey)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req := httptest.NewRequest("GET", "/api/metrics/stream", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	// Run in goroutine since it blocks
	done := make(chan struct{})
	go func() {
		router.ServeHTTP(w, req)
		close(done)
	}()

	// Wait a bit for the initial metrics event to be written
	time.Sleep(500 * time.Millisecond)
	cancel()
	<-done

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	ct := w.Header().Get("Content-Type")
	if ct != "text/event-stream" {
		t.Errorf("Content-Type = %q", ct)
	}

	body := w.Body.String()
	if !strings.Contains(body, "event: metrics") {
		t.Errorf("body missing 'event: metrics': %q", body)
	}
	if !strings.Contains(body, "data: ") {
		t.Errorf("body missing data: %q", body)
	}
}

func TestMetricsStream_NoAuth(t *testing.T) {
	router, _, _, _ := testServer(t)

	req := httptest.NewRequest("GET", "/api/metrics/stream", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestTaskEvents_NoSSE(t *testing.T) {
	router, _, apiKey, _ := testServer(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/tasks/some-id/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestTaskEvents_WithSSE(t *testing.T) {
	broker := sse.NewBroker()
	router, _, apiKey := testServerWithSSEBroker(t, broker)
	token := getToken(t, router, apiKey)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req := httptest.NewRequest("GET", "/api/tasks/task-123/events", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(w, req)
		close(done)
	}()

	// Wait for subscription to register
	time.Sleep(100 * time.Millisecond)

	// Publish an event
	broker.Publish(sse.Event{
		Topic: "task:task-123",
		Type:  "progress",
		Data:  `{"status":"running","progress":50}`,
	})

	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done

	body := w.Body.String()
	if !strings.Contains(body, "event: progress") {
		t.Errorf("missing 'event: progress' in body: %q", body)
	}
	if !strings.Contains(body, `"progress":50`) {
		t.Errorf("missing progress data in body: %q", body)
	}
}

func TestAppEvents_WithSSE(t *testing.T) {
	broker := sse.NewBroker()
	router, _, apiKey := testServerWithSSEBroker(t, broker)
	token := getToken(t, router, apiKey)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req := httptest.NewRequest("GET", "/api/apps/app-456/events", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(w, req)
		close(done)
	}()

	time.Sleep(100 * time.Millisecond)

	broker.Publish(sse.Event{
		Topic: "app:app-456",
		Type:  "deploy",
		Data:  `{"status":"running"}`,
	})

	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done

	body := w.Body.String()
	if !strings.Contains(body, "event: deploy") {
		t.Errorf("missing 'event: deploy' in body: %q", body)
	}
}

func TestSSEEventFormat(t *testing.T) {
	// Verify the SSE format with a scanner (like a real client would read)
	formatted := sse.Event{Type: "test", Data: `{"key":"value"}`}.Format()
	scanner := bufio.NewScanner(strings.NewReader(formatted))

	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if len(lines) < 2 {
		t.Fatalf("expected at least 2 lines, got %d", len(lines))
	}
	if lines[0] != "event: test" {
		t.Errorf("line 0 = %q", lines[0])
	}
	if lines[1] != `data: {"key":"value"}` {
		t.Errorf("line 1 = %q", lines[1])
	}
}
