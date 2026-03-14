package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/speedtest"
)

func TestSpeedtestDownloadEndpoint(t *testing.T) {
	// Speedtest routes are public — no auth needed
	router, _, _, _ := testServer(t)

	req := httptest.NewRequest("GET", "/api/speedtest/download?size=1kb", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Body.Len() != 1024 {
		t.Errorf("body size = %d, want 1024", w.Body.Len())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("Content-Type = %q", ct)
	}
}

func TestSpeedtestUploadEndpoint(t *testing.T) {
	router, _, _, _ := testServer(t)

	data := bytes.Repeat([]byte("a"), 2048)
	req := httptest.NewRequest("POST", "/api/speedtest/upload", bytes.NewReader(data))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result struct {
		Bytes      int64   `json:"bytes"`
		DurationMs int64   `json:"duration_ms"`
		SpeedMbps  float64 `json:"speed_mbps"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	if result.Bytes != 2048 {
		t.Errorf("bytes = %d, want 2048", result.Bytes)
	}
}

func TestSpeedtestPingEndpoint(t *testing.T) {
	router, _, _, _ := testServer(t)

	req := httptest.NewRequest("GET", "/api/speedtest/ping", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result struct {
		Timestamp string `json:"timestamp"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	if result.Timestamp == "" {
		t.Error("empty timestamp")
	}
}

func testServerWithIperf(t *testing.T) (http.Handler, string, *speedtest.IperfServer) {
	t.Helper()
	router, database, apiKey, _ := testServerWithDeps(t, nil)
	iperf := speedtest.NewIperfServer("15201")
	// Re-create router with iperf — testServerWithDeps doesn't pass Iperf
	jwtSecret, _ := db.GetConfig(database, "jwt_secret")
	jwtMgr := auth.NewJWTManager(jwtSecret, 1*time.Hour)
	h := NewRouter(Deps{DB: database, JWT: jwtMgr, Iperf: iperf})
	_ = router // discard original
	_ = apiKey
	return h, apiKey, iperf
}

func TestIperfStatusDefault(t *testing.T) {
	router, apiKey, _ := testServerWithIperf(t)

	req := httptest.NewRequest("GET", "/api/speedtest/iperf/status", nil)
	req.Header.Set("Authorization", "Bearer "+authToken(t, router, apiKey))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result map[string]string
	json.Unmarshal(w.Body.Bytes(), &result)
	// iperf3 not on PATH in test env → "unavailable" or "stopped"
	if result["status"] != "stopped" && result["status"] != "unavailable" {
		t.Errorf("expected stopped or unavailable, got %q", result["status"])
	}
}

func TestIperfStartStopToggle(t *testing.T) {
	router, apiKey, _ := testServerWithIperf(t)
	token := authToken(t, router, apiKey)

	// Start — may fail if iperf3 not installed, that's OK
	req := httptest.NewRequest("POST", "/api/speedtest/iperf/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Accept 200 (started) or 409 (already running or not found)
	if w.Code != http.StatusOK && w.Code != http.StatusConflict {
		t.Fatalf("start: expected 200 or 409, got %d: %s", w.Code, w.Body.String())
	}

	// Stop — should always succeed
	req = httptest.NewRequest("POST", "/api/speedtest/iperf/stop", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("stop: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIperfNilReturns503(t *testing.T) {
	// testServer creates Deps without Iperf → nil
	router, _, apiKey, _ := testServer(t)
	token := authToken(t, router, apiKey)

	for _, path := range []string{"/api/speedtest/iperf/start", "/api/speedtest/iperf/stop"} {
		req := httptest.NewRequest("POST", path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Errorf("%s: expected 503, got %d", path, w.Code)
		}
	}
}

func authToken(t *testing.T, router http.Handler, apiKey string) string {
	t.Helper()
	body := fmt.Sprintf(`{"api_key":"%s"}`, apiKey)
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("login failed: %d", w.Code)
	}
	var result struct {
		Token string `json:"token"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	return result.Token
}
