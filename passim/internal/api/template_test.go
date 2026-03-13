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
	tmpl "github.com/passim/passim/internal/template"
)

func setupTestServerWithTemplates(t *testing.T, registry *tmpl.Registry) (http.Handler, string) {
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

	router := NewRouter(Deps{DB: database, JWT: jwtMgr, Templates: registry})
	return router, plain
}

func TestListTemplates(t *testing.T) {
	yamlData := []byte(`
name: wireguard
category: vpn
version: 1.0.0
icon: shield
description:
  en-US: "Peer-to-peer VPN"
  zh-CN: "点对点 VPN"
settings:
  - key: peers
    type: number
    min: 1
    max: 25
    default: 1
    label:
      en-US: "Number of Peers"
container:
  image: linuxserver/wireguard
  ports:
    - "51820:51820/udp"
  volumes:
    - "/data/configs/wireguard:/config"
  environment:
    PEERS: "{{settings.peers}}"
  labels:
    io.passim: vpn
`)

	tmpDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tmpDir, "wireguard.yaml"), yamlData, 0644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	registry := tmpl.NewRegistry()
	if err := registry.LoadDir(tmpDir); err != nil {
		t.Fatalf("LoadDir() error: %v", err)
	}

	router, apiKey := setupTestServerWithTemplates(t, registry)
	token := loginForToken(t, router, apiKey)

	req := httptest.NewRequest(http.MethodGet, "/api/templates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}

	var result []templateSummary
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("len = %d, want 1", len(result))
	}

	wg := result[0]
	if wg.Name != "wireguard" {
		t.Errorf("Name = %q, want %q", wg.Name, "wireguard")
	}
	if wg.Category != "vpn" {
		t.Errorf("Category = %q, want %q", wg.Category, "vpn")
	}
	if len(wg.Settings) != 1 || wg.Settings[0].Key != "peers" {
		t.Errorf("Settings unexpected: %+v", wg.Settings)
	}
}

func TestListTemplatesRequiresAuth(t *testing.T) {
	registry := tmpl.NewRegistry()
	router, _ := setupTestServerWithTemplates(t, registry)

	req := httptest.NewRequest(http.MethodGet, "/api/templates", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
