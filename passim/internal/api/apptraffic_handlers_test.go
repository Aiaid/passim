package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

func setupTrafficTest(t *testing.T) (http.Handler, string, string, *db.AppUser) {
	t.Helper()

	reg := template.NewRegistry()
	if err := reg.LoadDir(templateDir(t)); err != nil {
		t.Fatal(err)
	}

	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	appID := "app-traffic-test"
	app := &db.App{
		ID:       appID,
		Template: "hysteria",
		Settings: `{"port":443,"password":"pw"}`,
		Status:   "running",
	}
	db.CreateApp(database, app)

	user := &db.AppUser{
		ID: "tuser-001", AppID: appID, Username: "alice",
		Password: "pw", Enabled: true, QuotaBytes: 0,
	}
	db.CreateAppUser(database, user)

	// Insert some traffic. In production the collector keys traffic logs
	// by username (the "id" returned to hy2 auth), so the test uses
	// UserID=username to match reality.
	db.InsertTrafficLogs(database, []db.TrafficLog{
		{AppID: appID, UserID: "alice", TxBytes: 1000, RxBytes: 2000},
		{AppID: appID, UserID: "alice", TxBytes: 500, RxBytes: 300},
	})

	return router, token, appID, user
}

func TestGetTraffic24h(t *testing.T) {
	router, token, appID, _ := setupTrafficTest(t)

	w := doRequest(router, "GET", "/api/apps/"+appID+"/traffic?period=24h", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp trafficResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Period != "24h" {
		t.Errorf("period = %q, want 24h", resp.Period)
	}
	if resp.Total.TxBytes != 1500 {
		t.Errorf("total tx = %d, want 1500", resp.Total.TxBytes)
	}
	if resp.Total.RxBytes != 2300 {
		t.Errorf("total rx = %d, want 2300", resp.Total.RxBytes)
	}
	if len(resp.Users) != 1 {
		t.Fatalf("expected 1 user, got %d", len(resp.Users))
	}
	if resp.Users[0].Username != "alice" {
		t.Errorf("username = %q, want alice", resp.Users[0].Username)
	}
}

func TestGetTrafficDefaultPeriod(t *testing.T) {
	router, token, appID, _ := setupTrafficTest(t)

	w := doRequest(router, "GET", "/api/apps/"+appID+"/traffic", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp trafficResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Period != "24h" {
		t.Errorf("default period = %q, want 24h", resp.Period)
	}
}

func TestGetTrafficNoMetricsSupport(t *testing.T) {
	reg := template.NewRegistry()
	reg.LoadDir(templateDir(t))
	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	// wireguard has no metrics
	app := &db.App{
		ID: "app-no-metrics", Template: "wireguard",
		Settings: `{"peers":1}`, Status: "running",
	}
	db.CreateApp(database, app)

	w := doRequest(router, "GET", "/api/apps/app-no-metrics/traffic", token, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetUserTrafficHistory(t *testing.T) {
	router, token, appID, _ := setupTrafficTest(t)

	w := doRequest(router, "GET", "/api/apps/"+appID+"/traffic/alice/history?period=24h", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp trafficHistoryResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Granularity != "1 hour" {
		t.Errorf("granularity = %q, want '1 hour'", resp.Granularity)
	}
	// Points should have data
	if len(resp.Points) == 0 {
		t.Errorf("expected at least 1 data point")
	}
}

func TestGetUserTrafficHistoryNotFound(t *testing.T) {
	router, token, appID, _ := setupTrafficTest(t)

	w := doRequest(router, "GET", "/api/apps/"+appID+"/traffic/nonexistent/history", token, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestResetTraffic(t *testing.T) {
	router, token, appID, _ := setupTrafficTest(t)

	// Sanity: traffic exists pre-reset
	w := doRequest(router, "GET", "/api/apps/"+appID+"/traffic?period=24h", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("pre-reset GET expected 200, got %d", w.Code)
	}
	var pre trafficResponse
	json.Unmarshal(w.Body.Bytes(), &pre)
	if pre.Total.TxBytes == 0 || pre.Total.RxBytes == 0 {
		t.Fatalf("pre-reset traffic should be non-zero, got %+v", pre.Total)
	}

	// Reset (no remote nodes in test → only local rows wiped)
	w = doRequest(router, "POST", "/api/apps/"+appID+"/traffic/reset", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("reset expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resetResp struct {
		OK            bool  `json:"ok"`
		DeletedLocal  int64 `json:"deleted_local"`
		DeletedRemote int64 `json:"deleted_remote"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resetResp); err != nil {
		t.Fatalf("decode reset response: %v", err)
	}
	if !resetResp.OK {
		t.Errorf("reset ok = false")
	}
	if resetResp.DeletedLocal != 2 {
		t.Errorf("deleted_local = %d, want 2", resetResp.DeletedLocal)
	}
	if resetResp.DeletedRemote != 0 {
		t.Errorf("deleted_remote = %d, want 0 (no remote nodes)", resetResp.DeletedRemote)
	}

	// Post-reset: GET returns zeros and no users
	w = doRequest(router, "GET", "/api/apps/"+appID+"/traffic?period=24h", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("post-reset GET expected 200, got %d", w.Code)
	}
	var post trafficResponse
	json.Unmarshal(w.Body.Bytes(), &post)
	if post.Total.TxBytes != 0 || post.Total.RxBytes != 0 {
		t.Errorf("post-reset totals should be zero, got %+v", post.Total)
	}
	if len(post.Users) != 0 {
		t.Errorf("post-reset users should be empty, got %d", len(post.Users))
	}
}

func TestResetTrafficNoMetricsSupport(t *testing.T) {
	reg := template.NewRegistry()
	reg.LoadDir(templateDir(t))
	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	// wireguard has no metrics support → reset must 400 like GET does
	app := &db.App{
		ID: "app-no-metrics-reset", Template: "wireguard",
		Settings: `{"peers":1}`, Status: "running",
	}
	db.CreateApp(database, app)

	w := doRequest(router, "POST", "/api/apps/app-no-metrics-reset/traffic/reset", token, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestResetTrafficUnauthorized(t *testing.T) {
	router, _, appID, _ := setupTrafficTest(t)

	// No token → JWT middleware should reject
	w := doRequest(router, "POST", "/api/apps/"+appID+"/traffic/reset", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}
