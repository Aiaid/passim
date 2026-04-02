package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

// setupUserHandlersTest creates a test server with a deployed hysteria app.
func setupUserHandlersTest(t *testing.T) (http.Handler, string, string) {
	t.Helper()

	reg := template.NewRegistry()
	if err := reg.LoadDir(templateDir(t)); err != nil {
		t.Fatal(err)
	}

	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	// Create app directly in DB (skip deploy flow)
	app := &db.App{
		ID:       "app-users-test",
		Template: "hysteria",
		Settings: `{"port":443,"password":"testpw"}`,
		Status:   "running",
	}
	if err := db.CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	return router, token, "app-users-test"
}

func authedRequest(t *testing.T, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var bodyReader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	return w
}

func doRequest(router http.Handler, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	var bodyReader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestListAppUsersEmpty(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)
	w := doRequest(router, "GET", "/api/apps/"+appID+"/users", token, nil)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Users []appUserResponse `json:"users"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Users) != 0 {
		t.Errorf("expected empty users list, got %d", len(resp.Users))
	}
}

func TestCreateAppUser(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "testuser",
		"password": "testpass",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp appUserResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Username != "testuser" {
		t.Errorf("username = %q, want testuser", resp.Username)
	}
	if !resp.Enabled {
		t.Errorf("expected enabled=true")
	}
	if resp.ID == "" {
		t.Errorf("expected non-empty ID")
	}
}

func TestCreateAppUserAutoPassword(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "autopw",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateAppUserDuplicate(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "dup", "password": "pw",
	})

	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "dup", "password": "pw2",
	})

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateAppUserNoUsersSupport(t *testing.T) {
	reg := template.NewRegistry()
	reg.LoadDir(templateDir(t))
	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	// wireguard template does not have users support
	app := &db.App{
		ID: "app-no-users", Template: "wireguard",
		Settings: `{"peers":1}`, Status: "running",
	}
	db.CreateApp(database, app)

	w := doRequest(router, "POST", "/api/apps/app-no-users/users", token, map[string]interface{}{
		"username": "test",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateAppUser(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	// Create user first
	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "updateme", "password": "pw",
	})
	var created appUserResponse
	json.Unmarshal(w.Body.Bytes(), &created)

	// Update: disable
	enabled := false
	w = doRequest(router, "PATCH", "/api/apps/"+appID+"/users/"+created.ID, token, map[string]interface{}{
		"enabled": enabled,
	})

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated appUserResponse
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Enabled {
		t.Errorf("expected enabled=false after update")
	}
}

func TestDeleteAppUser(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	// Create user
	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "deleteme", "password": "pw",
	})
	var created appUserResponse
	json.Unmarshal(w.Body.Bytes(), &created)

	// Delete
	w = doRequest(router, "DELETE", "/api/apps/"+appID+"/users/"+created.ID, token, nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify gone
	w = doRequest(router, "GET", "/api/apps/"+appID+"/users", token, nil)
	var resp struct {
		Users []appUserResponse `json:"users"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Users) != 0 {
		t.Errorf("expected 0 users after delete, got %d", len(resp.Users))
	}
}

func TestDeleteAppUserNotFound(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	w := doRequest(router, "DELETE", "/api/apps/"+appID+"/users/nonexistent", token, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateAppUserEmptyUsername(t *testing.T) {
	router, token, appID := setupUserHandlersTest(t)

	w := doRequest(router, "POST", "/api/apps/"+appID+"/users", token, map[string]interface{}{
		"username": "",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}
