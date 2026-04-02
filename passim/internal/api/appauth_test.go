package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/template"
)

func setupAuthTest(t *testing.T) (http.Handler, *db.AppUser) {
	t.Helper()

	reg := template.NewRegistry()
	if err := reg.LoadDir(templateDir(t)); err != nil {
		t.Fatal(err)
	}

	router, database, _ := testServerFull(t, nil, reg)

	// Create a test app
	app := &db.App{
		ID:       "test-app-001",
		Template: "hysteria",
		Settings: `{"port":443}`,
		Status:   "running",
	}
	if err := db.CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	// Create a test user
	user := &db.AppUser{
		ID:         "user-001",
		AppID:      "test-app-001",
		Username:   "alice",
		Password:   "secret123",
		Enabled:    true,
		QuotaBytes: 0,
	}
	if err := db.CreateAppUser(database, user); err != nil {
		t.Fatal(err)
	}

	return router, user
}

func postAuth(router http.Handler, appID, auth string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"auth": auth})
	req := httptest.NewRequest("POST", "/api/internal/app-auth/"+appID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "172.18.0.3:12345" // simulate Docker network source
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAppAuthSuccess(t *testing.T) {
	router, _ := setupAuthTest(t)
	w := postAuth(router, "test-app-001", "alice:secret123")

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != true {
		t.Errorf("expected ok=true, got %v", resp["ok"])
	}
	if resp["id"] != "alice" {
		t.Errorf("expected id=alice, got %v", resp["id"])
	}
}

func TestAppAuthWrongPassword(t *testing.T) {
	router, _ := setupAuthTest(t)
	w := postAuth(router, "test-app-001", "alice:wrongpw")

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != false {
		t.Errorf("expected ok=false, got %v", resp["ok"])
	}
}

func TestAppAuthDisabled(t *testing.T) {
	reg := template.NewRegistry()
	reg.LoadDir(templateDir(t))
	router, database, _ := testServerFull(t, nil, reg)

	app := &db.App{ID: "test-app-002", Template: "hysteria", Settings: `{"port":443}`, Status: "running"}
	db.CreateApp(database, app)

	user := &db.AppUser{
		ID: "user-002", AppID: "test-app-002", Username: "bob", Password: "pw",
		Enabled: false, QuotaBytes: 0,
	}
	db.CreateAppUser(database, user)

	w := postAuth(router, "test-app-002", "bob:pw")
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != false {
		t.Errorf("expected ok=false for disabled user, got %v", resp["ok"])
	}
}

func TestAppAuthOverQuota(t *testing.T) {
	reg := template.NewRegistry()
	reg.LoadDir(templateDir(t))
	router, database, _ := testServerFull(t, nil, reg)

	app := &db.App{ID: "test-app-003", Template: "hysteria", Settings: `{"port":443}`, Status: "running"}
	db.CreateApp(database, app)

	user := &db.AppUser{
		ID: "user-003", AppID: "test-app-003", Username: "charlie", Password: "pw",
		Enabled: true, QuotaBytes: 100,
	}
	db.CreateAppUser(database, user)

	// Insert traffic logs that exceed quota
	db.InsertTrafficLogs(database, []db.TrafficLog{
		{AppID: "test-app-003", UserID: "user-003", TxBytes: 60, RxBytes: 50},
	})

	w := postAuth(router, "test-app-003", "charlie:pw")
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != false {
		t.Errorf("expected ok=false for over-quota user, got %v", resp["ok"])
	}
}

func TestAppAuthBadFormat(t *testing.T) {
	router, _ := setupAuthTest(t)
	w := postAuth(router, "test-app-001", "no-colon-here")

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != false {
		t.Errorf("expected ok=false for bad format, got %v", resp["ok"])
	}
}

func TestAppAuthUnknownApp(t *testing.T) {
	router, _ := setupAuthTest(t)
	w := postAuth(router, "nonexistent-app", "alice:secret123")

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ok"] != false {
		t.Errorf("expected ok=false for unknown app, got %v", resp["ok"])
	}
}

func TestAppAuthBlocksPublicIP(t *testing.T) {
	router, _ := setupAuthTest(t)

	body, _ := json.Marshal(map[string]string{"auth": "alice:secret123"})
	req := httptest.NewRequest("POST", "/api/internal/app-auth/test-app-001", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "8.8.8.8:12345" // public IP
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for public IP, got %d", w.Code)
	}
}
