package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

func setupStaticRouter(webFS fstest.MapFS) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	ServeStatic(r, webFS)
	return r
}

func TestStaticServesIndexHTML(t *testing.T) {
	webFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>hello</html>")},
	}
	router := setupStaticRouter(webFS)

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "<html>hello</html>") {
		t.Fatalf("expected index.html content, got: %s", w.Body.String())
	}
}

func TestStaticServesAsset(t *testing.T) {
	webFS := fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte("<html>hello</html>")},
		"assets/main.js": &fstest.MapFile{Data: []byte(`console.log("ok")`)},
	}
	router := setupStaticRouter(webFS)

	req := httptest.NewRequest("GET", "/assets/main.js", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `console.log("ok")`) {
		t.Fatalf("expected JS content, got: %s", w.Body.String())
	}
}

func TestStaticSPAFallback(t *testing.T) {
	webFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>hello</html>")},
	}
	router := setupStaticRouter(webFS)

	req := httptest.NewRequest("GET", "/dashboard", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "<html>hello</html>") {
		t.Fatalf("expected index.html content for SPA fallback, got: %s", w.Body.String())
	}
}

func TestStaticAPIRouteReturns404JSON(t *testing.T) {
	webFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>hello</html>")},
	}
	router := setupStaticRouter(webFS)

	req := httptest.NewRequest("GET", "/api/nonexistent", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"error":"not found"`) {
		t.Fatalf("expected JSON error, got: %s", w.Body.String())
	}
}

func TestStaticCacheHeaders(t *testing.T) {
	// Regression: embed.FS has zero ModTime → http.FileServer emits no
	// Last-Modified / ETag / Cache-Control, so browsers fall back to heuristic
	// caching and keep serving a stale index.html across upgrades. We must
	// explicitly mark index.html as no-cache (revalidate every load) and hashed
	// assets as immutable (cacheable forever because the URL changes with
	// content).
	webFS := fstest.MapFS{
		"index.html":                &fstest.MapFile{Data: []byte("<html>hello</html>")},
		"favicon.ico":               &fstest.MapFile{Data: []byte{0, 0, 1, 0}},
		"assets/index-abc12345.js":  &fstest.MapFile{Data: []byte(`console.log("ok")`)},
		"assets/index-abc12345.css": &fstest.MapFile{Data: []byte("body{}")},
	}
	router := setupStaticRouter(webFS)

	cases := []struct {
		path string
		want string
	}{
		{"/", "no-cache, must-revalidate"},                                // SPA shell
		{"/dashboard", "no-cache, must-revalidate"},                       // SPA fallback
		{"/favicon.ico", "no-cache, must-revalidate"},                     // non-hashed root file
		{"/assets/index-abc12345.js", "public, max-age=31536000, immutable"},
		{"/assets/index-abc12345.css", "public, max-age=31536000, immutable"},
	}
	for _, tc := range cases {
		req := httptest.NewRequest("GET", tc.path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if got := w.Header().Get("Cache-Control"); got != tc.want {
			t.Errorf("GET %s → Cache-Control=%q, want %q", tc.path, got, tc.want)
		}
	}
}

func TestStaticFavicon(t *testing.T) {
	faviconData := []byte{0x00, 0x00, 0x01, 0x00} // minimal ICO header bytes
	webFS := fstest.MapFS{
		"index.html":  &fstest.MapFile{Data: []byte("<html>hello</html>")},
		"favicon.ico": &fstest.MapFile{Data: faviconData},
	}
	router := setupStaticRouter(webFS)

	req := httptest.NewRequest("GET", "/favicon.ico", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.Bytes()
	if len(body) != len(faviconData) {
		t.Fatalf("expected %d bytes, got %d", len(faviconData), len(body))
	}
	for i, b := range faviconData {
		if body[i] != b {
			t.Fatalf("byte mismatch at %d: expected %x, got %x", i, b, body[i])
		}
	}
}
