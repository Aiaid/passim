package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
)

func setupTestServer(t *testing.T) (http.Handler, *sql.DB, string) {
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

	// Generate known API key for testing
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	router := NewRouter(Deps{DB: database, JWT: jwtMgr})
	return router, database, plain
}

func TestLoginSuccess(t *testing.T) {
	router, _, apiKey := setupTestServer(t)

	body, _ := json.Marshal(map[string]string{"api_key": apiKey})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["token"] == nil || resp["token"] == "" {
		t.Fatal("expected token in response")
	}
	if resp["expires_at"] == nil {
		t.Fatal("expected expires_at in response")
	}
}

func TestLoginWrongKey(t *testing.T) {
	router, _, _ := setupTestServer(t)

	body, _ := json.Marshal(map[string]string{"api_key": "psk_wrong"})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestLoginMissingKey(t *testing.T) {
	router, _, _ := setupTestServer(t)

	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestRefreshSuccess(t *testing.T) {
	router, _, apiKey := setupTestServer(t)

	// Login first
	body, _ := json.Marshal(map[string]string{"api_key": apiKey})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var loginResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &loginResp)
	token := loginResp["token"].(string)

	// Refresh
	body, _ = json.Marshal(map[string]string{"token": token})
	req = httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["token"] == nil || resp["token"] == "" {
		t.Fatal("expected new token")
	}
}

func TestRefreshInvalidToken(t *testing.T) {
	router, _, _ := setupTestServer(t)

	body, _ := json.Marshal(map[string]string{"token": "invalid.token.here"})
	req := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
