//go:build e2e

package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
)

// startE2EServer creates a full end-to-end test server with real HTTP transport.
// It returns the base URL, API key, database, mock Docker client, and a cleanup function.
func startE2EServer(t *testing.T) (baseURL string, apiKey string, database *sql.DB, mock *docker.MockClient, cleanup func()) {
	t.Helper()

	// Create temp directory for data
	tempDir := t.TempDir()
	t.Setenv("DATA_DIR", tempDir)

	// Open real SQLite database
	dbPath := filepath.Join(tempDir, "test.db")
	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}

	// Set up auth
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	// Create mock Docker client with defaults for successful deploys
	mock = &docker.MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "test-container-id",
	}

	// Load template registry from templates directory
	reg := template.NewRegistry()
	templatesDir := filepath.Join("..", "..", "templates")
	if err := reg.LoadDir(templatesDir); err != nil {
		t.Fatalf("load templates: %v", err)
	}

	// Create task queue with 1 worker
	q := task.NewQueue(database, 100)
	q.Start(1)

	// Create SSE broker
	broker := sse.NewBroker()

	// Build deps
	deps := Deps{
		DB:        database,
		JWT:       jwtMgr,
		Docker:    mock,
		Templates: reg,
		Tasks:     q,
		SSE:       broker,
	}

	// Register task handlers
	RegisterTaskHandlers(q, deps)

	// Create real HTTP test server
	server := httptest.NewServer(NewRouter(deps))

	cleanup = func() {
		server.Close()
		q.Stop()
		database.Close()
		os.Remove(dbPath)
	}

	return server.URL, plain, database, mock, cleanup
}

// e2eLogin performs a real HTTP POST to /api/auth/login and returns the JWT token.
func e2eLogin(t *testing.T, baseURL, apiKey string) string {
	t.Helper()

	body, _ := json.Marshal(map[string]string{"api_key": apiKey})
	resp, err := http.Post(baseURL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("login failed: %d %s", resp.StatusCode, string(data))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode login response: %v", err)
	}

	token, ok := result["token"].(string)
	if !ok || token == "" {
		t.Fatal("login response missing token")
	}
	return token
}

// e2eRequest sends a real HTTP request with optional JSON body and Bearer token.
func e2eRequest(t *testing.T, method, url, token string, body interface{}) *http.Response {
	t.Helper()

	var reqBody io.Reader
	if body != nil {
		switch v := body.(type) {
		case string:
			reqBody = strings.NewReader(v)
		case []byte:
			reqBody = bytes.NewReader(v)
		default:
			data, err := json.Marshal(body)
			if err != nil {
				t.Fatalf("marshal request body: %v", err)
			}
			reqBody = bytes.NewReader(data)
		}
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request %s %s failed: %v", method, url, err)
	}

	return resp
}
