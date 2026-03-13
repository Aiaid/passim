package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
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
