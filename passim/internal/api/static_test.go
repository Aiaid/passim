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
