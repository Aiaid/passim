package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
)

// testServer creates a full test server with mock Docker.
// Returns (handler, database, apiKey, mockDocker).
func testServer(t *testing.T) (http.Handler, *sql.DB, string, *docker.MockClient) {
	t.Helper()
	mockDocker := &docker.MockClient{}
	return testServerWithDeps(t, mockDocker)
}

// testServerNoDocker creates a test server without Docker.
func testServerNoDocker(t *testing.T) (http.Handler, *sql.DB, string) {
	t.Helper()
	h, database, apiKey, _ := testServerWithDeps(t, nil)
	return h, database, apiKey
}

func testServerWithDeps(t *testing.T, dockerClient docker.DockerClient) (http.Handler, *sql.DB, string, *docker.MockClient) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(path)
	})

	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)

	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	router := NewRouter(Deps{DB: database, JWT: jwtMgr, Docker: dockerClient})

	var mock *docker.MockClient
	if dockerClient != nil {
		mock, _ = dockerClient.(*docker.MockClient)
	}
	return router, database, plain, mock
}

// getToken logs in with an API key and returns the JWT token.
func getToken(t *testing.T, handler http.Handler, apiKey string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"api_key": apiKey})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	return resp["token"].(string)
}
