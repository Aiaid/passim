package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/passim/passim/internal/db"
)

func TestMiddlewareNoToken(t *testing.T) {
	router, _, _, _ := testServer(t)

	req := httptest.NewRequest("GET", "/api/status", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestMiddlewareInvalidToken(t *testing.T) {
	router, _, _, _ := testServer(t)

	req := httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer invalid.token")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestMiddlewareValidToken(t *testing.T) {
	router, _, apiKey, _ := testServer(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMiddlewareRevokedToken(t *testing.T) {
	router, database, apiKey, _ := testServer(t)
	token := getToken(t, router, apiKey)

	if err := db.SetConfig(database, "auth_version", "2"); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for revoked token, got %d", w.Code)
	}
}
