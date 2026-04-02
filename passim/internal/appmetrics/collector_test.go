package appmetrics

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/template"

	_ "github.com/mattn/go-sqlite3" // SQLite driver for in-memory test DB
)

// setupTestDB creates an in-memory SQLite database with migrations applied.
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestNewCollector(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()

	c := NewCollector(database, nil, registry)
	if c == nil {
		t.Fatal("NewCollector returned nil")
	}
	if c.db != database {
		t.Error("db not set")
	}
	if c.templates != registry {
		t.Error("templates not set")
	}
	if c.pollers == nil {
		t.Error("pollers map not initialized")
	}
	if c.online == nil {
		t.Error("online map not initialized")
	}
}

func TestStartStopPolling(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()

	c := NewCollector(database, nil, registry)

	app := &db.App{
		ID:          "test-app-1",
		Template:    "hysteria",
		ContainerID: "abc123",
		Status:      "running",
	}
	tmpl := &template.Template{
		Name: "hysteria",
		Metrics: &template.MetricsConfig{
			Interval: "1h", // long interval so the goroutine doesn't actually poll
			PerUser: &template.PerUserMetrics{
				Method: "api",
				URL:    "http://{{container.ip}}:9999/traffic",
			},
		},
	}

	// StartPolling should not panic even with nil docker client
	c.StartPolling(app, tmpl)

	c.mu.Lock()
	_, exists := c.pollers[app.ID]
	c.mu.Unlock()
	if !exists {
		t.Error("poller not registered after StartPolling")
	}

	// StopPolling should clean up
	c.StopPolling(app.ID)

	c.mu.Lock()
	_, exists = c.pollers[app.ID]
	c.mu.Unlock()
	if exists {
		t.Error("poller still registered after StopPolling")
	}
}

func TestStartPollingNoMetrics(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	app := &db.App{ID: "test-app-2"}
	tmpl := &template.Template{Name: "plain"}

	// Should not create a poller when no metrics config
	c.StartPolling(app, tmpl)

	c.mu.Lock()
	_, exists := c.pollers[app.ID]
	c.mu.Unlock()
	if exists {
		t.Error("poller should not be created for template without metrics")
	}
}

func TestStopAll(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	tmpl := &template.Template{
		Name: "test",
		Metrics: &template.MetricsConfig{
			Interval: "1h",
			PerUser:  &template.PerUserMetrics{Method: "api", URL: "http://{{container.ip}}:9999/traffic"},
		},
	}

	// Start multiple pollers
	for i := 0; i < 5; i++ {
		app := &db.App{ID: "app-" + string(rune('a'+i)), ContainerID: "cid-" + string(rune('a'+i))}
		c.StartPolling(app, tmpl)
	}

	c.mu.Lock()
	count := len(c.pollers)
	c.mu.Unlock()
	if count != 5 {
		t.Fatalf("expected 5 pollers, got %d", count)
	}

	c.StopAll()

	c.mu.Lock()
	count = len(c.pollers)
	c.mu.Unlock()
	if count != 0 {
		t.Errorf("expected 0 pollers after StopAll, got %d", count)
	}
}

func TestGetOnline(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	// No data yet
	if got := c.GetOnline("nonexistent"); got != nil {
		t.Errorf("expected nil for nonexistent app, got %v", got)
	}

	// Set data directly
	c.onlineMu.Lock()
	c.online["app-1"] = map[string]int{"alice": 2, "bob": 1}
	c.onlineMu.Unlock()

	got := c.GetOnline("app-1")
	if got == nil {
		t.Fatal("expected non-nil online data")
	}
	if got["alice"] != 2 {
		t.Errorf("alice: got %d, want 2", got["alice"])
	}
	if got["bob"] != 1 {
		t.Errorf("bob: got %d, want 1", got["bob"])
	}

	// Verify it's a copy (mutating returned map should not affect internal state)
	got["alice"] = 99
	original := c.GetOnline("app-1")
	if original["alice"] != 2 {
		t.Error("GetOnline did not return a copy")
	}
}

func TestResolveURL(t *testing.T) {
	tests := []struct {
		tmpl string
		ip   string
		want string
	}{
		{"http://{{container.ip}}:9999/traffic", "172.17.0.2", "http://172.17.0.2:9999/traffic"},
		{"http://localhost:9999/traffic", "172.17.0.2", "http://localhost:9999/traffic"},
		{"", "172.17.0.2", ""},
	}
	for _, tt := range tests {
		got := resolveURL(tt.tmpl, tt.ip)
		if got != tt.want {
			t.Errorf("resolveURL(%q, %q) = %q, want %q", tt.tmpl, tt.ip, got, tt.want)
		}
	}
}

func TestResolveSecret(t *testing.T) {
	generated := `{"stats_secret":"my-secret-123","other":"val"}`

	tests := []struct {
		tmpl      string
		generated string
		want      string
	}{
		{"{{generated.stats_secret}}", generated, "my-secret-123"},
		{"{{generated.other}}", generated, "val"},
		{"{{generated.missing}}", generated, "{{generated.missing}}"},
		{"plain-secret", generated, "plain-secret"},
		{"", generated, ""},
	}
	for _, tt := range tests {
		got := resolveSecret(tt.tmpl, tt.generated)
		if got != tt.want {
			t.Errorf("resolveSecret(%q) = %q, want %q", tt.tmpl, got, tt.want)
		}
	}
}

func TestPollTraffic(t *testing.T) {
	database := setupTestDB(t)

	// Create a test app in the DB
	err := db.CreateApp(database, &db.App{
		ID:       "traffic-app-1",
		Template: "test",
		Settings: "{}",
		Status:   "running",
	})
	if err != nil {
		t.Fatalf("create app: %v", err)
	}

	// Mock HTTP server returning hy2 traffic format
	trafficData := map[string]struct {
		Tx int64 `json:"tx"`
		Rx int64 `json:"rx"`
	}{
		"alice": {Tx: 1024, Rx: 2048},
		"bob":   {Tx: 512, Rx: 256},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(trafficData)
	}))
	defer srv.Close()

	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	err = c.pollTraffic(context.Background(), "traffic-app-1", srv.URL, "")
	if err != nil {
		t.Fatalf("pollTraffic: %v", err)
	}

	// Verify data was inserted
	summaries, err := db.GetTrafficSummary(database, "traffic-app-1", time.Now().Add(-1*time.Hour))
	if err != nil {
		t.Fatalf("GetTrafficSummary: %v", err)
	}
	if len(summaries) != 2 {
		t.Fatalf("expected 2 summaries, got %d", len(summaries))
	}

	found := make(map[string]db.TrafficSummary)
	for _, s := range summaries {
		found[s.UserID] = s
	}
	if found["alice"].TxBytes != 1024 || found["alice"].RxBytes != 2048 {
		t.Errorf("alice traffic: got tx=%d rx=%d, want tx=1024 rx=2048", found["alice"].TxBytes, found["alice"].RxBytes)
	}
	if found["bob"].TxBytes != 512 || found["bob"].RxBytes != 256 {
		t.Errorf("bob traffic: got tx=%d rx=%d, want tx=512 rx=256", found["bob"].TxBytes, found["bob"].RxBytes)
	}
}

func TestPollTrafficWithSecret(t *testing.T) {
	database := setupTestDB(t)

	err := db.CreateApp(database, &db.App{
		ID:       "secret-app-1",
		Template: "test",
		Settings: "{}",
		Status:   "running",
	})
	if err != nil {
		t.Fatalf("create app: %v", err)
	}

	var receivedAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		json.NewEncoder(w).Encode(map[string]struct {
			Tx int64 `json:"tx"`
			Rx int64 `json:"rx"`
		}{
			"user1": {Tx: 100, Rx: 200},
		})
	}))
	defer srv.Close()

	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	err = c.pollTraffic(context.Background(), "secret-app-1", srv.URL, "my-secret-token")
	if err != nil {
		t.Fatalf("pollTraffic: %v", err)
	}

	if receivedAuth != "my-secret-token" {
		t.Errorf("Authorization header: got %q, want %q", receivedAuth, "my-secret-token")
	}
}

func TestPollOnlineStatus(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	onlineData := map[string]int{"alice": 2, "bob": 1, "charlie": 0}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(onlineData)
	}))
	defer srv.Close()

	err := c.pollOnlineStatus(context.Background(), "online-app-1", srv.URL, "")
	if err != nil {
		t.Fatalf("pollOnlineStatus: %v", err)
	}

	got := c.GetOnline("online-app-1")
	if got == nil {
		t.Fatal("expected non-nil online data")
	}
	if got["alice"] != 2 {
		t.Errorf("alice: got %d, want 2", got["alice"])
	}
	if got["bob"] != 1 {
		t.Errorf("bob: got %d, want 1", got["bob"])
	}
	if got["charlie"] != 0 {
		t.Errorf("charlie: got %d, want 0", got["charlie"])
	}
}

func TestPollOnlineWithSecret(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	var receivedAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		json.NewEncoder(w).Encode(map[string]int{"alice": 1})
	}))
	defer srv.Close()

	err := c.pollOnlineStatus(context.Background(), "online-secret-1", srv.URL, "secret-val")
	if err != nil {
		t.Fatalf("pollOnlineStatus: %v", err)
	}

	if receivedAuth != "secret-val" {
		t.Errorf("Authorization header: got %q, want %q", receivedAuth, "secret-val")
	}
}

func TestPollTrafficServerError(t *testing.T) {
	database := setupTestDB(t)
	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	err := c.pollTraffic(context.Background(), "err-app-1", srv.URL, "")
	if err == nil {
		t.Error("expected error for server 500 response")
	}
}

func TestPollTrafficZeroTraffic(t *testing.T) {
	database := setupTestDB(t)

	err := db.CreateApp(database, &db.App{
		ID:       "zero-app-1",
		Template: "test",
		Settings: "{}",
		Status:   "running",
	})
	if err != nil {
		t.Fatalf("create app: %v", err)
	}

	// Return all-zero traffic — InsertTrafficLogs skips zero entries
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]struct {
			Tx int64 `json:"tx"`
			Rx int64 `json:"rx"`
		}{
			"idle_user": {Tx: 0, Rx: 0},
		})
	}))
	defer srv.Close()

	registry := template.NewRegistry()
	c := NewCollector(database, nil, registry)

	err = c.pollTraffic(context.Background(), "zero-app-1", srv.URL, "")
	if err != nil {
		t.Fatalf("pollTraffic: %v", err)
	}

	// No records should be inserted (zero traffic skipped by InsertTrafficLogs)
	summaries, err := db.GetTrafficSummary(database, "zero-app-1", time.Now().Add(-1*time.Hour))
	if err != nil {
		t.Fatalf("GetTrafficSummary: %v", err)
	}
	if len(summaries) != 0 {
		t.Errorf("expected 0 summaries for zero traffic, got %d", len(summaries))
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
