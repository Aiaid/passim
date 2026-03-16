package node

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/sse"
)

func TestLoginToRemote(t *testing.T) {
	server := mockRemoteServer(t)
	defer server.Close()

	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)

	address := strings.TrimPrefix(server.URL, "https://")

	rc := &RemoteConn{
		info: db.RemoteNode{
			ID:      "node-test",
			Address: address,
			APIKey:  "psk_test123",
		},
		httpClient: server.Client(),
	}

	err := hub.loginToRemote(context.Background(), rc)
	if err != nil {
		t.Fatal(err)
	}

	rc.mu.RLock()
	token := rc.token
	rc.mu.RUnlock()

	if token != "jwt-token-abc" {
		t.Errorf("token = %q, want jwt-token-abc", token)
	}
}

func TestLoginToRemote_BadKey(t *testing.T) {
	server := mockRemoteServer(t)
	defer server.Close()

	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)

	address := strings.TrimPrefix(server.URL, "https://")

	rc := &RemoteConn{
		info: db.RemoteNode{
			ID:      "node-test",
			Address: address,
			APIKey:  "wrong-key",
		},
		httpClient: server.Client(),
	}

	err := hub.loginToRemote(context.Background(), rc)
	if err == nil {
		t.Fatal("expected error for bad API key")
	}
}

func TestSSEEventParsing(t *testing.T) {
	// Create a server that emits SSE events then closes
	sseServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/auth/login":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"token": "jwt-test"})
			return

		case "/api/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "streaming not supported", http.StatusInternalServerError)
				return
			}

			// Emit metrics event
			metricsData := `{"cpu_percent":45.2,"memory_percent":72.1,"disk_percent":55.0,"containers":{"running":3,"total":5}}`
			fmt.Fprintf(w, "event: metrics\ndata: %s\n\n", metricsData)
			flusher.Flush()

			// Emit containers event
			containersData := `[{"name":"wireguard","state":"running","image":"wg-easy"},{"name":"filebrowser","state":"stopped","image":"filebrowser"}]`
			fmt.Fprintf(w, "event: containers\ndata: %s\n\n", containersData)
			flusher.Flush()

			// Emit status event
			statusData := `{"node":{"country":"US"}}`
			fmt.Fprintf(w, "event: status\ndata: %s\n\n", statusData)
			flusher.Flush()

			// Emit apps event
			appsData := `[{"id":"app-1","template":"wireguard"}]`
			fmt.Fprintf(w, "event: apps\ndata: %s\n\n", appsData)
			flusher.Flush()

			// Emit app-specific event
			appEventData := `{"status":"running"}`
			fmt.Fprintf(w, "event: app:app-1\ndata: %s\n\n", appEventData)
			flusher.Flush()

			// Close the connection (SSE will return error)
			return
		}
	}))
	defer sseServer.Close()

	database := setupTestDB(t)
	broker := sse.NewBroker()

	// Subscribe to broker to verify events are published
	sub := broker.SubscribeAll()
	defer broker.Unsubscribe(sub)

	hub := NewHub(database, broker)
	hub.newHTTPClient = func() *http.Client {
		return sseServer.Client()
	}
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	address := strings.TrimPrefix(sseServer.URL, "https://")

	// Create node in DB
	now := time.Now().UTC().Format(time.RFC3339)
	node := &db.RemoteNode{
		ID:        "node-sse-test",
		Name:      "SSE Test",
		Address:   address,
		APIKey:    "psk_test",
		Status:    "connecting",
		CreatedAt: now,
	}
	if err := db.CreateRemoteNode(database, node); err != nil {
		t.Fatal(err)
	}

	rc := &RemoteConn{
		info:       *node,
		status:     "connecting",
		httpClient: sseServer.Client(),
	}

	// Login
	err := hub.loginToRemote(context.Background(), rc)
	if err != nil {
		t.Fatal(err)
	}

	// Subscribe to SSE (will process events until stream closes)
	err = hub.subscribeSSE(context.Background(), rc)
	// SSE returns error when stream closes — that's expected
	if err == nil {
		t.Fatal("expected error when SSE stream closes")
	}

	// Verify cached metrics
	rc.mu.RLock()
	metrics := rc.metrics
	containers := rc.containers
	country := rc.info.Country
	status := rc.status
	rc.mu.RUnlock()

	if metrics == nil {
		t.Fatal("expected metrics to be cached")
	}
	if metrics.CPUPercent != 45.2 {
		t.Errorf("cpu_percent = %f, want 45.2", metrics.CPUPercent)
	}
	if metrics.MemoryPercent != 72.1 {
		t.Errorf("memory_percent = %f, want 72.1", metrics.MemoryPercent)
	}
	if metrics.DiskPercent != 55.0 {
		t.Errorf("disk_percent = %f, want 55.0", metrics.DiskPercent)
	}
	if metrics.Containers.Running != 3 {
		t.Errorf("containers.running = %d, want 3", metrics.Containers.Running)
	}
	if metrics.Containers.Total != 5 {
		t.Errorf("containers.total = %d, want 5", metrics.Containers.Total)
	}

	// Verify cached containers
	if len(containers) != 2 {
		t.Fatalf("containers len = %d, want 2", len(containers))
	}
	if containers[0].Name != "wireguard" {
		t.Errorf("containers[0].name = %q, want wireguard", containers[0].Name)
	}
	if containers[0].State != "running" {
		t.Errorf("containers[0].state = %q, want running", containers[0].State)
	}
	if containers[1].Name != "filebrowser" {
		t.Errorf("containers[1].name = %q, want filebrowser", containers[1].Name)
	}

	// Verify country was updated
	if country != "US" {
		t.Errorf("country = %q, want US", country)
	}

	// Verify status was set to connected
	if status != "connected" {
		t.Errorf("status = %q, want connected", status)
	}

	// Verify broker received events by draining
	var receivedTopics []string
	timeout := time.After(100 * time.Millisecond)
	for {
		select {
		case event := <-sub.Chan():
			receivedTopics = append(receivedTopics, event.Topic+":"+event.Type)
		case <-timeout:
			goto done
		}
	}
done:
	// We should have received at least metrics, containers, status, apps events
	if len(receivedTopics) < 4 {
		t.Errorf("received %d broker events, want at least 4: %v", len(receivedTopics), receivedTopics)
	}
}

func TestReconnectBackoff(t *testing.T) {
	// This test verifies the reconnect loop exits when context is cancelled,
	// rather than testing actual timing (which would be flaky).

	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	// Use a client factory that always fails
	hub.newHTTPClient = func() *http.Client {
		return &http.Client{
			Timeout: 50 * time.Millisecond,
			Transport: &http.Transport{
				// Point to an unreachable address
			},
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	node := &db.RemoteNode{
		ID:        "node-reconnect",
		Name:      "Reconnect Test",
		Address:   "127.0.0.1:1", // unreachable
		APIKey:    "psk_test",
		Status:    "disconnected",
		CreatedAt: now,
	}
	if err := db.CreateRemoteNode(database, node); err != nil {
		t.Fatal(err)
	}

	rc := &RemoteConn{
		info:       *node,
		status:     "disconnected",
		httpClient: hub.newHTTPClient(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Start reconnect loop (should exit when context is cancelled)
	done := make(chan struct{})
	go func() {
		hub.reconnectLoop(ctx, rc)
		close(done)
	}()

	// Cancel early
	time.Sleep(200 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Good, loop exited
	case <-time.After(5 * time.Second):
		t.Fatal("reconnect loop did not exit after context cancellation")
	}

	// Verify status is disconnected
	rc.mu.RLock()
	status := rc.status
	rc.mu.RUnlock()
	if status != "disconnected" && status != "connecting" {
		t.Errorf("status = %q, expected disconnected or connecting", status)
	}
}

func TestLoginRemote_EmptyToken(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"token": ""})
	}))
	defer server.Close()

	_, err := loginRemote(context.Background(), server.Client(), strings.TrimPrefix(server.URL, "https://"), "key")
	if err == nil {
		t.Fatal("expected error for empty token")
	}
	if !strings.Contains(err.Error(), "empty token") {
		t.Errorf("error = %q, expected to contain 'empty token'", err.Error())
	}
}

func TestLoginRemote_BadJSON(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	_, err := loginRemote(context.Background(), server.Client(), strings.TrimPrefix(server.URL, "https://"), "key")
	if err == nil {
		t.Fatal("expected error for bad JSON")
	}
}

func TestLoginRemote_ServerError(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"server error"}`))
	}))
	defer server.Close()

	_, err := loginRemote(context.Background(), server.Client(), strings.TrimPrefix(server.URL, "https://"), "key")
	if err == nil {
		t.Fatal("expected error for server error")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error = %q, expected to contain '500'", err.Error())
	}
}
