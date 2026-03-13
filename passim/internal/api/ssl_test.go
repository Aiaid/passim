package api

import (
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
	"github.com/passim/passim/internal/ssl"
)

func testServerWithSSL(t *testing.T, mgr *ssl.SSLManager) (http.Handler, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(dbPath)
	})

	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)
	router := NewRouter(Deps{DB: database, JWT: jwtMgr, SSL: mgr})
	return router, plain
}

func TestSSLStatusEndpoint(t *testing.T) {
	dir := t.TempDir()
	mgr := ssl.NewSSLManager("self-signed", dir)
	if err := mgr.Init(); err != nil {
		t.Fatal(err)
	}

	router, apiKey := testServerWithSSL(t, mgr)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/ssl/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var status ssl.SSLStatus
	json.Unmarshal(w.Body.Bytes(), &status)

	if status.Mode != "self-signed" {
		t.Errorf("mode = %q, want self-signed", status.Mode)
	}
	if !status.Valid {
		t.Error("expected valid cert")
	}
}

func TestSSLRenewEndpoint_SelfSigned(t *testing.T) {
	dir := t.TempDir()
	mgr := ssl.NewSSLManager("self-signed", dir)
	mgr.Init()

	router, apiKey := testServerWithSSL(t, mgr)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("POST", "/api/ssl/renew", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
