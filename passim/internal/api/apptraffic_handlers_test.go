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

	// Insert some traffic
	db.InsertTrafficLogs(database, []db.TrafficLog{
		{AppID: appID, UserID: "tuser-001", TxBytes: 1000, RxBytes: 2000},
		{AppID: appID, UserID: "tuser-001", TxBytes: 500, RxBytes: 300},
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
