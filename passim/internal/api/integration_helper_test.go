//go:build integration

package api

import (
	"database/sql"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
	"github.com/passim/passim/internal/template"
)

// integEnv holds all real dependencies wired together for integration tests.
type integEnv struct {
	Handler    http.Handler
	DB         *sql.DB
	APIKey     string
	MockDocker *docker.MockClient
	Queue      *task.Queue
	Broker     *sse.Broker
	DataDir    string
	Registry   *template.Registry
}

// testServerIntegration assembles all real dependencies for cross-layer integration tests.
// It creates a real SQLite DB, loads templates from ../../templates/, sets up a real
// task queue with deploy/undeploy handlers, and an SSE broker.
func testServerIntegration(t *testing.T, mock *docker.MockClient) *integEnv {
	t.Helper()

	// 1. Real SQLite (temp file)
	dbPath := filepath.Join(t.TempDir(), "integ.db")
	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(dbPath)
	})

	// 2. Auth setup
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)
	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	// 3. Template Registry from real YAML files
	reg := template.NewRegistry()
	if err := reg.LoadDir("../../templates/"); err != nil {
		t.Fatal("load templates:", err)
	}

	// 4. DATA_DIR → temp directory
	dataDir := t.TempDir()
	t.Setenv("DATA_DIR", dataDir)

	// 5. SSE Broker
	broker := sse.NewBroker()

	// 6. Task Queue with 1 worker
	q := task.NewQueue(database, 100)

	// 7. Build deps and register task handlers
	deps := Deps{
		DB:        database,
		JWT:       jwtMgr,
		Docker:    mock,
		Templates: reg,
		SSE:       broker,
		Tasks:     q,
	}
	RegisterTaskHandlers(q, deps)

	// Start workers after handlers are registered
	q.Start(1)
	t.Cleanup(func() { q.Stop() })

	// 8. Build router
	router := NewRouter(deps)

	return &integEnv{
		Handler:    router,
		DB:         database,
		APIKey:     plain,
		MockDocker: mock,
		Queue:      q,
		Broker:     broker,
		DataDir:    dataDir,
		Registry:   reg,
	}
}

// defaultMock returns a MockClient configured for successful deploys.
func defaultMock() *docker.MockClient {
	return &docker.MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-integ-001",
	}
}
