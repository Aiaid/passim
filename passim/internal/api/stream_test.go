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

// readSSEEvents reads SSE events from a response body until the context
// is cancelled or the expected number of events is received.
func readSSEEvents(t *testing.T, resp *http.Response, count int, timeout time.Duration) []sseEvent {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var events []sseEvent
	scanner := bufio.NewScanner(resp.Body)
	var current sseEvent

	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			// Empty line = end of event
			if current.data != "" || current.eventType != "" {
				events = append(events, current)
				current = sseEvent{}
			}
			if len(events) >= count {
				return events
			}
			continue
		}

		if strings.HasPrefix(line, "event: ") {
			current.eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			current.data = strings.TrimPrefix(line, "data: ")
		}

		select {
		case <-ctx.Done():
			return events
		default:
		}
	}
	return events
}

type sseEvent struct {
	eventType string
	data      string
}

func TestStreamInitialSnapshot(t *testing.T) {
	handler, _, apiKey := testServerNoDocker(t)
	token := getToken(t, handler, apiKey)

	// Use a real HTTP server so SSE streaming works
	srv := httptest.NewServer(handler)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/stream?token="+token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	// Initial snapshot should contain: metrics, status, apps
	// (no containers since Docker is nil)
	events := readSSEEvents(t, resp, 3, 10*time.Second)

	eventTypes := make(map[string]bool)
	for _, e := range events {
		eventTypes[e.eventType] = true
	}

	if !eventTypes["metrics"] {
		t.Error("initial snapshot missing 'metrics' event")
	}
	if !eventTypes["status"] {
		t.Error("initial snapshot missing 'status' event")
	}
	if !eventTypes["apps"] {
		t.Error("initial snapshot missing 'apps' event")
	}
}

func TestStreamBrokerForwarding(t *testing.T) {
	broker := sse.NewBroker()
	handler, _, apiKey := testServerWithSSEBroker(t, broker)
	token := getToken(t, handler, apiKey)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/stream?token="+token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	// Read initial snapshot first (metrics, status, containers, apps)
	readSSEEvents(t, resp, 4, 10*time.Second)

	// Publish a broker event
	broker.Publish(sse.Event{
		Topic: "app:test-123",
		Type:  "deploy",
		Data:  `{"status":"running"}`,
	})

	// Read the forwarded event
	events := readSSEEvents(t, resp, 1, 5*time.Second)
	if len(events) == 0 {
		t.Fatal("no broker event received")
	}

	if events[0].eventType != "app:test-123" {
		t.Errorf("event type = %q, want %q", events[0].eventType, "app:test-123")
	}
	if !strings.Contains(events[0].data, `"deploy"`) {
		t.Errorf("event data does not contain deploy type: %s", events[0].data)
	}
}

func TestStreamRequiresAuth(t *testing.T) {
	handler, _, _ := testServerNoDocker(t)

	req := httptest.NewRequest("GET", "/api/stream", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}
