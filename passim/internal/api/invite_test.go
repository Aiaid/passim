package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
)

// testServerWithNodeHubAndDB exposes the underlying *sql.DB so tests that
// need to seed rows directly (e.g. expired invite tokens) can do so.
func testServerWithNodeHubAndDB(t *testing.T, hub NodeHub) (http.Handler, *sql.DB, string, *auth.JWTManager) {
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

	router := NewRouter(Deps{DB: database, JWT: jwtMgr, NodeHub: hub})
	return router, database, plain, jwtMgr
}

func postJSON(t *testing.T, router http.Handler, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestCreateInvite_Defaults(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", token, map[string]interface{}{"note": "lab box"})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp inviteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !strings.HasPrefix(resp.Token, invitePrefix) {
		t.Errorf("token %q missing prefix", resp.Token)
	}
	if resp.Note != "lab box" {
		t.Errorf("note = %q", resp.Note)
	}
	if resp.ExpiresAt-resp.CreatedAt != int64(defaultInviteTTL.Seconds()) {
		t.Errorf("ttl = %d, want %d", resp.ExpiresAt-resp.CreatedAt, int64(defaultInviteTTL.Seconds()))
	}
	if !strings.Contains(resp.InstallCmd, resp.Token) {
		t.Errorf("install_cmd missing token: %s", resp.InstallCmd)
	}
	if !strings.Contains(resp.DockerCmd, resp.Token) {
		t.Errorf("docker_cmd missing token: %s", resp.DockerCmd)
	}
}

func TestCreateInvite_CustomTTL(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	token := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", token, map[string]interface{}{"ttl_seconds": 300})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
	var resp inviteResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.ExpiresAt-resp.CreatedAt != 300 {
		t.Errorf("ttl = %d, want 300", resp.ExpiresAt-resp.CreatedAt)
	}
}

func TestListInvites_OnlyActive(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", jwt, map[string]interface{}{"note": "active"})
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d", w.Code)
	}
	var active inviteResponse
	json.Unmarshal(w.Body.Bytes(), &active)

	revokedResp := postJSON(t, router, "POST", "/api/cluster/invites", jwt, map[string]interface{}{"note": "rev"})
	var revoked inviteResponse
	json.Unmarshal(revokedResp.Body.Bytes(), &revoked)
	postJSON(t, router, "DELETE", "/api/cluster/invites/"+revoked.Token, jwt, nil)

	w2 := postJSON(t, router, "GET", "/api/cluster/invites", jwt, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("list: %d", w2.Code)
	}
	var list []inviteListItem
	json.Unmarshal(w2.Body.Bytes(), &list)

	if len(list) != 1 {
		t.Fatalf("expected 1 active invite, got %d", len(list))
	}
	if list[0].Token != active.Token {
		t.Errorf("expected %s, got %s", active.Token, list[0].Token)
	}
}

func TestListInvites_ExpiredFiltered(t *testing.T) {
	hub := newMockNodeHub()
	router, database, apiKey, _ := testServerWithNodeHubAndDB(t, hub)
	jwt := getToken(t, router, apiKey)

	now := time.Now().Unix()
	if err := db.CreateInviteToken(database, &db.InviteToken{
		Token:     "psk_invite_expired",
		Note:      "old",
		ExpiresAt: now - 100,
		CreatedAt: now - 200,
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.CreateInviteToken(database, &db.InviteToken{
		Token:     "psk_invite_active",
		Note:      "new",
		ExpiresAt: now + 3600,
		CreatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}

	w := postJSON(t, router, "GET", "/api/cluster/invites", jwt, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d", w.Code)
	}
	var list []inviteListItem
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 || list[0].Token != "psk_invite_active" {
		t.Fatalf("got %+v, want only active", list)
	}
}

func TestRevokeInvite(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", jwt, nil)
	var resp inviteResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	w2 := postJSON(t, router, "DELETE", "/api/cluster/invites/"+resp.Token, jwt, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("revoke: %d %s", w2.Code, w2.Body.String())
	}

	w3 := postJSON(t, router, "DELETE", "/api/cluster/invites/"+resp.Token, jwt, nil)
	if w3.Code != http.StatusNotFound {
		t.Errorf("second revoke: expected 404, got %d", w3.Code)
	}
}

func TestRevokeInvite_Unknown(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "DELETE", "/api/cluster/invites/nope", jwt, nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestJoin_Success(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", jwt, nil)
	var inv inviteResponse
	json.Unmarshal(w.Body.Bytes(), &inv)

	w2 := postJSON(t, router, "POST", "/api/cluster/join", "", map[string]interface{}{
		"token":   inv.Token,
		"address": "10.0.0.5:8443",
		"api_key": "remote-key",
		"name":    "node-b",
	})
	if w2.Code != http.StatusCreated {
		t.Fatalf("join: %d %s", w2.Code, w2.Body.String())
	}
	var resp map[string]string
	json.Unmarshal(w2.Body.Bytes(), &resp)
	if resp["status"] != "joined" {
		t.Errorf("status = %q", resp["status"])
	}
	if resp["id"] == "" {
		t.Error("missing id")
	}
}

func TestJoin_InvalidToken(t *testing.T) {
	hub := newMockNodeHub()
	router, _ := testServerWithNodeHub(t, hub)

	w := postJSON(t, router, "POST", "/api/cluster/join", "", map[string]interface{}{
		"token":   "psk_invite_nope",
		"address": "10.0.0.5:8443",
		"api_key": "k",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJoin_RevokedToken(t *testing.T) {
	hub := newMockNodeHub()
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", jwt, nil)
	var inv inviteResponse
	json.Unmarshal(w.Body.Bytes(), &inv)
	postJSON(t, router, "DELETE", "/api/cluster/invites/"+inv.Token, jwt, nil)

	w2 := postJSON(t, router, "POST", "/api/cluster/join", "", map[string]interface{}{
		"token":   inv.Token,
		"address": "10.0.0.5:8443",
		"api_key": "k",
	})
	if w2.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w2.Code)
	}
}

func TestJoin_ExpiredToken(t *testing.T) {
	hub := newMockNodeHub()
	router, database, _, _ := testServerWithNodeHubAndDB(t, hub)

	now := time.Now().Unix()
	if err := db.CreateInviteToken(database, &db.InviteToken{
		Token:     "psk_invite_old",
		ExpiresAt: now - 1,
		CreatedAt: now - 100,
	}); err != nil {
		t.Fatal(err)
	}

	w := postJSON(t, router, "POST", "/api/cluster/join", "", map[string]interface{}{
		"token":   "psk_invite_old",
		"address": "10.0.0.5:8443",
		"api_key": "k",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJoin_HubError(t *testing.T) {
	hub := newMockNodeHub()
	hub.addErr = fmt.Errorf("connection refused")
	router, apiKey := testServerWithNodeHub(t, hub)
	jwt := getToken(t, router, apiKey)

	w := postJSON(t, router, "POST", "/api/cluster/invites", jwt, nil)
	var inv inviteResponse
	json.Unmarshal(w.Body.Bytes(), &inv)

	w2 := postJSON(t, router, "POST", "/api/cluster/join", "", map[string]interface{}{
		"token":   inv.Token,
		"address": "10.0.0.5:8443",
		"api_key": "k",
	})
	if w2.Code != http.StatusBadGateway {
		t.Errorf("expected 502, got %d", w2.Code)
	}
}

func TestCreateInvite_NoAuth(t *testing.T) {
	hub := newMockNodeHub()
	router, _ := testServerWithNodeHub(t, hub)

	w := postJSON(t, router, "POST", "/api/cluster/invites", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
