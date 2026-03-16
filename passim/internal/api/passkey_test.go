package api

import (
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

// testServerWithWebAuthn creates a test server with a WebAuthn manager.
func testServerWithWebAuthn(t *testing.T) (http.Handler, *sql.DB, string) {
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

	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)
	wanMgr, err := auth.NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatal(err)
	}

	router := NewRouter(Deps{DB: database, JWT: jwtMgr, WebAuthn: wanMgr})
	return router, database, plain
}

func TestPasskeyExistsEmpty(t *testing.T) {
	router, _, _ := testServerWithWebAuthn(t)

	req := httptest.NewRequest("GET", "/api/auth/passkeys/exists", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["exists"] != false {
		t.Errorf("expected exists=false, got %v", resp["exists"])
	}
}

func TestPasskeyExistsWithPasskey(t *testing.T) {
	router, database, _ := testServerWithWebAuthn(t)

	// Insert a passkey directly into the DB.
	pk := &db.Passkey{
		ID:           "pk-test-001",
		CredentialID: []byte("test-cred-id"),
		PublicKey:    []byte("test-pub-key"),
		Name:         "Test Key",
	}
	if err := db.CreatePasskey(database, pk); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/auth/passkeys/exists", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["exists"] != true {
		t.Errorf("expected exists=true, got %v", resp["exists"])
	}
}

func TestPasskeyBeginLoginNoPasskeys(t *testing.T) {
	router, _, _ := testServerWithWebAuthn(t)

	req := httptest.NewRequest("POST", "/api/auth/passkey/begin", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPasskeyFinishLoginNoPasskeys(t *testing.T) {
	router, _, _ := testServerWithWebAuthn(t)

	req := httptest.NewRequest("POST", "/api/auth/passkey/finish", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPasskeyProtectedRoutesRequireAuth(t *testing.T) {
	router, _, _ := testServerWithWebAuthn(t)

	routes := []struct {
		method string
		path   string
	}{
		{"POST", "/api/auth/passkey/register"},
		{"POST", "/api/auth/passkey/register/finish"},
		{"GET", "/api/auth/passkeys"},
		{"DELETE", "/api/auth/passkeys/some-id"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestPasskeyListEmpty(t *testing.T) {
	router, _, apiKey := testServerWithWebAuthn(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/auth/passkeys", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var items []interface{}
	json.Unmarshal(w.Body.Bytes(), &items)
	if len(items) != 0 {
		t.Errorf("expected empty array, got %d items", len(items))
	}
}

func TestPasskeyListWithPasskeys(t *testing.T) {
	router, database, apiKey := testServerWithWebAuthn(t)
	token := getToken(t, router, apiKey)

	pk := &db.Passkey{
		ID:           "pk-list-001",
		CredentialID: []byte("cred-id-list"),
		PublicKey:    []byte("pub-key-list"),
		Name:         "My Key",
	}
	if err := db.CreatePasskey(database, pk); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/auth/passkeys", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var items []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &items)
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0]["name"] != "My Key" {
		t.Errorf("name = %q, want My Key", items[0]["name"])
	}
	// Verify that credential_id and public_key are NOT in the response.
	if _, ok := items[0]["credential_id"]; ok {
		t.Error("credential_id should not be in list response")
	}
	if _, ok := items[0]["public_key"]; ok {
		t.Error("public_key should not be in list response")
	}
}

func TestPasskeyDeleteNotFound(t *testing.T) {
	router, _, apiKey := testServerWithWebAuthn(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/auth/passkeys/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPasskeyDeleteSuccess(t *testing.T) {
	router, database, apiKey := testServerWithWebAuthn(t)
	token := getToken(t, router, apiKey)

	pk := &db.Passkey{
		ID:           "pk-del-001",
		CredentialID: []byte("cred-id-del"),
		PublicKey:    []byte("pub-key-del"),
		Name:         "Delete Me",
	}
	if err := db.CreatePasskey(database, pk); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("DELETE", "/api/auth/passkeys/pk-del-001", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify it's deleted.
	got, _ := db.GetPasskey(database, "pk-del-001")
	if got != nil {
		t.Error("passkey should be deleted")
	}
}

func TestPasskeyBeginRegisterRequiresAuth(t *testing.T) {
	router, _, _ := testServerWithWebAuthn(t)

	req := httptest.NewRequest("POST", "/api/auth/passkey/register", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPasskeyBeginRegisterSuccess(t *testing.T) {
	router, _, apiKey := testServerWithWebAuthn(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("POST", "/api/auth/passkey/register", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify response contains creation options (unwrapped from publicKey).
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["challenge"] == nil {
		t.Error("expected challenge in response")
	}
}

func TestPasskeyRoutesNotRegisteredWithoutWebAuthn(t *testing.T) {
	router, _, _ := testServerNoDocker(t)

	// Public passkey routes should not exist.
	routes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/auth/passkeys/exists"},
		{"POST", "/api/auth/passkey/begin"},
		{"POST", "/api/auth/passkey/finish"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Without WebAuthn, these routes don't exist, so 404.
			if w.Code != http.StatusNotFound {
				t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
