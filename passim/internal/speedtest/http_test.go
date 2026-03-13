package speedtest

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupRouter() *gin.Engine {
	r := gin.New()
	r.GET("/download", DownloadHandler)
	r.POST("/upload", UploadHandler)
	r.GET("/ping", PingHandler)
	return r
}

func TestDownloadHandler_DefaultSize(t *testing.T) {
	r := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/download", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/octet-stream")
	}
	if cl := w.Header().Get("Content-Length"); cl != "104857600" {
		t.Errorf("Content-Length = %q, want %q", cl, "104857600")
	}
}

func TestDownloadHandler_CustomSize(t *testing.T) {
	r := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/download?size=1kb", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if w.Body.Len() != 1024 {
		t.Errorf("body size = %d, want %d", w.Body.Len(), 1024)
	}
}

func TestDownloadHandler_InvalidSize(t *testing.T) {
	r := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/download?size=abc", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUploadHandler(t *testing.T) {
	r := setupRouter()

	data := bytes.Repeat([]byte("x"), 10*1024) // 10KB
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/upload", bytes.NewReader(data))
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result UploadResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Bytes != int64(len(data)) {
		t.Errorf("bytes = %d, want %d", result.Bytes, len(data))
	}
	if result.DurationMs <= 0 {
		t.Errorf("duration_ms = %d, want > 0", result.DurationMs)
	}
	if result.SpeedMbps < 0 {
		t.Errorf("speed_mbps = %f, want >= 0", result.SpeedMbps)
	}
}

func TestUploadHandler_EmptyBody(t *testing.T) {
	r := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/upload", strings.NewReader(""))
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result UploadResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Bytes != 0 {
		t.Errorf("bytes = %d, want 0", result.Bytes)
	}
}

func TestPingHandler(t *testing.T) {
	r := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/ping", nil)

	before := time.Now().UTC()
	r.ServeHTTP(w, req)
	after := time.Now().UTC()

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result PingResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if result.Timestamp == "" {
		t.Fatal("timestamp is empty")
	}

	ts, err := time.Parse("2006-01-02T15:04:05.000Z", result.Timestamp)
	if err != nil {
		t.Fatalf("parse timestamp %q: %v", result.Timestamp, err)
	}

	if ts.Before(before.Add(-time.Second)) || ts.After(after.Add(time.Second)) {
		t.Errorf("timestamp %v not between %v and %v", ts, before, after)
	}
}

func TestParseSize(t *testing.T) {
	tests := []struct {
		input string
		want  int
		err   bool
	}{
		{"1024", 1024, false},
		{"1kb", 1024, false},
		{"1KB", 1024, false},
		{"10mb", 10 * 1024 * 1024, false},
		{"10MB", 10 * 1024 * 1024, false},
		{"1gb", 1024 * 1024 * 1024, false},
		{"100b", 100, false},
		{"", 0, true},
		{"abc", 0, true},
		{"10xx", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parseSize(tt.input)
			if (err != nil) != tt.err {
				t.Errorf("parseSize(%q) error = %v, want error = %v", tt.input, err, tt.err)
				return
			}
			if got != tt.want {
				t.Errorf("parseSize(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
