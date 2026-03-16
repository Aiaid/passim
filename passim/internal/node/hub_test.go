package node

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/sse"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(path)
	})
	return database
}

// mockRemoteServer creates a test server that mocks a remote Passim node.
// It handles /api/auth/login and /api/status endpoints.
func mockRemoteServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			APIKey string `json:"api_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if req.APIKey != "psk_test123" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid api key"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "jwt-token-abc",
			"expires_at": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		})
	})

	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer jwt-token-abc" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"node": map[string]interface{}{
				"id":      "remote-node-1",
				"name":    "Remote Node",
				"version": "0.1.0",
				"country": "DE",
			},
		})
	})

	mux.HandleFunc("/api/apps", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer jwt-token-abc" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]string{
			{"id": "app-1", "template": "wireguard"},
		})
	})

	return httptest.NewTLSServer(mux)
}

// testHTTPClientFactory returns a factory that creates HTTP clients using the test server's TLS config.
func testHTTPClientFactory(server *httptest.Server) func() *http.Client {
	return func() *http.Client {
		return server.Client()
	}
}

func TestAddNode(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)

	// Don't start background reconnect loops; we just test AddNode
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	// Extract host:port from the test server URL (strip "https://")
	address := strings.TrimPrefix(server.URL, "https://")

	info, err := hub.AddNode(context.Background(), address, "psk_test123", "Test Node")
	if err != nil {
		t.Fatal(err)
	}

	if info.Name != "Test Node" {
		t.Errorf("name = %q, want Test Node", info.Name)
	}
	if info.Address != address {
		t.Errorf("address = %q, want %q", info.Address, address)
	}
	if info.Country != "DE" {
		t.Errorf("country = %q, want DE", info.Country)
	}
	if info.ID == "" {
		t.Error("expected non-empty ID")
	}

	// Verify persisted to DB
	dbNode, err := db.GetRemoteNode(database, info.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dbNode == nil {
		t.Fatal("node not found in DB")
	}
	if dbNode.Name != "Test Node" {
		t.Errorf("db name = %q, want Test Node", dbNode.Name)
	}
}

func TestAddNode_InvalidAPIKey(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	address := strings.TrimPrefix(server.URL, "https://")

	_, err := hub.AddNode(context.Background(), address, "wrong-key", "Bad Node")
	if err == nil {
		t.Fatal("expected error for invalid API key")
	}
}

func TestRemoveNode(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	address := strings.TrimPrefix(server.URL, "https://")

	info, err := hub.AddNode(context.Background(), address, "psk_test123", "ToDelete")
	if err != nil {
		t.Fatal(err)
	}

	// Remove the node
	if err := hub.RemoveNode(info.ID); err != nil {
		t.Fatal(err)
	}

	// Verify removed from in-memory map
	_, err = hub.GetNode(info.ID)
	if err == nil {
		t.Error("expected error getting removed node")
	}

	// Verify removed from DB
	dbNode, err := db.GetRemoteNode(database, info.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dbNode != nil {
		t.Error("node should be removed from DB")
	}
}

func TestRemoveNode_NotFound(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	err := hub.RemoveNode("nonexistent")
	if err == nil {
		t.Error("expected error removing nonexistent node")
	}
}

func TestListNodes(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	// Empty list
	nodes := hub.ListNodes()
	if len(nodes) != 0 {
		t.Errorf("len = %d, want 0", len(nodes))
	}

	address := strings.TrimPrefix(server.URL, "https://")

	// Add two nodes
	_, err := hub.AddNode(context.Background(), address, "psk_test123", "Node A")
	if err != nil {
		t.Fatal(err)
	}
	_, err = hub.AddNode(context.Background(), address, "psk_test123", "Node B")
	if err != nil {
		t.Fatal(err)
	}

	nodes = hub.ListNodes()
	if len(nodes) != 2 {
		t.Errorf("len = %d, want 2", len(nodes))
	}
}

func TestUpdateNode(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	address := strings.TrimPrefix(server.URL, "https://")

	info, err := hub.AddNode(context.Background(), address, "psk_test123", "Original")
	if err != nil {
		t.Fatal(err)
	}

	if err := hub.UpdateNode(info.ID, "Updated"); err != nil {
		t.Fatal(err)
	}

	got, err := hub.GetNode(info.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Updated" {
		t.Errorf("name = %q, want Updated", got.Name)
	}

	// Also persisted to DB
	dbNode, err := db.GetRemoteNode(database, info.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dbNode.Name != "Updated" {
		t.Errorf("db name = %q, want Updated", dbNode.Name)
	}
}

func TestUpdateNode_NotFound(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	err := hub.UpdateNode("nonexistent", "name")
	if err == nil {
		t.Error("expected error updating nonexistent node")
	}
}

func TestProxyRequest(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()
	server := mockRemoteServer(t)
	defer server.Close()

	hub := NewHub(database, broker)
	hub.newHTTPClient = testHTTPClientFactory(server)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	address := strings.TrimPrefix(server.URL, "https://")

	info, err := hub.AddNode(context.Background(), address, "psk_test123", "Proxy Node")
	if err != nil {
		t.Fatal(err)
	}

	status, body, err := hub.ProxyRequest(context.Background(), info.ID, "GET", "/api/apps", nil)
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK {
		t.Errorf("status = %d, want 200", status)
	}

	var apps []map[string]string
	if err := json.Unmarshal(body, &apps); err != nil {
		t.Fatal(err)
	}
	if len(apps) != 1 {
		t.Fatalf("len = %d, want 1", len(apps))
	}
	if apps[0]["template"] != "wireguard" {
		t.Errorf("template = %q, want wireguard", apps[0]["template"])
	}
}

func TestProxyRequest_NodeNotFound(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	_, _, err := hub.ProxyRequest(context.Background(), "nonexistent", "GET", "/api/status", nil)
	if err == nil {
		t.Error("expected error for nonexistent node")
	}
}

func TestGetNode_NotFound(t *testing.T) {
	database := setupTestDB(t)
	broker := sse.NewBroker()

	hub := NewHub(database, broker)
	hub.ctx, hub.cancel = context.WithCancel(context.Background())
	defer hub.Stop()

	_, err := hub.GetNode("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent node")
	}
}
