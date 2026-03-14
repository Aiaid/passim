package api

import (
	"database/sql"
	"io"
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
)

// openDB opens a temp SQLite database for testing.
func openDB(t *testing.T) *sql.DB {
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
	return database
}

// initAuth sets up API key and JWT secret in the database, returns the JWT manager.
func initAuth(t *testing.T, database *sql.DB) *auth.JWTManager {
	t.Helper()
	_, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	db.SetConfig(database, "api_key_hash", hash)
	db.SetConfig(database, "auth_version", "1")

	secret, _ := auth.GenerateSecret()
	db.SetConfig(database, "jwt_secret", secret)
	return auth.NewJWTManager(secret, 1*time.Hour)
}

// waitForTask polls until the task reaches a terminal state or timeout.
func waitForTask(t *testing.T, database *sql.DB, taskID string, timeout time.Duration) *task.Task {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case <-deadline:
			t.Fatalf("timeout waiting for task %s", taskID)
			return nil
		default:
			tsk, _ := task.Get(database, taskID)
			if tsk != nil && (tsk.Status == task.StatusCompleted || tsk.Status == task.StatusFailed) {
				return tsk
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
}

func TestDeployHandler_Success(t *testing.T) {
	mock := &docker.MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-abc123",
	}

	database := openDB(t)
	jwtMgr := initAuth(t, database)

	q := task.NewQueue(database, 100)
	q.Start(1)
	t.Cleanup(func() { q.Stop() })

	broker := sse.NewBroker()

	deps := Deps{
		DB:     database,
		JWT:    jwtMgr,
		Docker: mock,
		SSE:    broker,
	}
	RegisterTaskHandlers(q, deps)

	// Create an app in deploying state
	app := &db.App{
		ID:       "test-app-id-1234567890",
		Template: "wireguard",
		Settings: `{"peers":1}`,
		Status:   "deploying",
	}
	if err := db.CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	payload := `{"AppID":"test-app-id-1234567890","AppName":"wireguard","Image":"linuxserver/wireguard","Env":{},"Ports":["51820:51820/udp"],"DataDir":"/tmp/testdata"}`
	taskID, err := q.Enqueue("deploy", "test-app-id-1234567890", payload)
	if err != nil {
		t.Fatal(err)
	}

	tsk := waitForTask(t, database, taskID, 5*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("expected task completed, got %s: %s", tsk.Status, tsk.Result)
	}

	// Verify app status updated
	updatedApp, _ := db.GetApp(database, "test-app-id-1234567890")
	if updatedApp == nil {
		t.Fatal("app not found after deploy")
	}
	if updatedApp.Status != "running" {
		t.Errorf("expected app status running, got %s", updatedApp.Status)
	}
	if updatedApp.ContainerID != "container-abc123" {
		t.Errorf("expected container ID container-abc123, got %s", updatedApp.ContainerID)
	}

	// Verify mock calls
	hasPull, hasCreate := false, false
	for _, call := range mock.Calls {
		if call.Method == "PullImage" {
			hasPull = true
		}
		if call.Method == "CreateAndStartContainer" {
			hasCreate = true
		}
	}
	if !hasPull {
		t.Error("expected PullImage call")
	}
	if !hasCreate {
		t.Error("expected CreateAndStartContainer call")
	}
}

func TestDeployHandler_PullFails(t *testing.T) {
	mock := &docker.MockClient{
		PullErr: io.ErrUnexpectedEOF,
	}

	database := openDB(t)
	jwtMgr := initAuth(t, database)

	q := task.NewQueue(database, 100)
	q.Start(1)
	t.Cleanup(func() { q.Stop() })

	deps := Deps{
		DB:     database,
		JWT:    jwtMgr,
		Docker: mock,
		SSE:    sse.NewBroker(),
	}
	RegisterTaskHandlers(q, deps)

	app := &db.App{
		ID:       "test-fail-id-1234567890",
		Template: "wireguard",
		Settings: `{}`,
		Status:   "deploying",
	}
	db.CreateApp(database, app)

	payload := `{"AppID":"test-fail-id-1234567890","AppName":"wireguard","Image":"linuxserver/wireguard","Env":{},"Ports":[],"DataDir":"/tmp/testdata"}`
	taskID, _ := q.Enqueue("deploy", "test-fail-id-1234567890", payload)

	tsk := waitForTask(t, database, taskID, 10*time.Second)
	if tsk.Status != task.StatusFailed {
		t.Fatalf("expected task failed, got %s", tsk.Status)
	}
	if tsk.Retries < 1 {
		t.Errorf("expected at least 1 retry, got %d", tsk.Retries)
	}

	// App should NOT be running
	updatedApp, _ := db.GetApp(database, "test-fail-id-1234567890")
	if updatedApp != nil && updatedApp.Status == "running" {
		t.Error("app should not be running after deploy failure")
	}
}

func TestUndeployHandler_Success(t *testing.T) {
	mock := &docker.MockClient{}

	database := openDB(t)
	jwtMgr := initAuth(t, database)

	q := task.NewQueue(database, 100)
	q.Start(1)
	t.Cleanup(func() { q.Stop() })

	deps := Deps{
		DB:     database,
		JWT:    jwtMgr,
		Docker: mock,
		SSE:    sse.NewBroker(),
	}
	RegisterTaskHandlers(q, deps)

	// Create an app to undeploy
	app := &db.App{
		ID:          "test-undeploy-1234567890",
		Template:    "wireguard",
		Settings:    `{}`,
		Status:      "running",
		ContainerID: "container-xyz",
	}
	db.CreateApp(database, app)

	payload := `{"app_id":"test-undeploy-1234567890","container_id":"container-xyz","template":"wireguard","data_dir":"/tmp/testundeploy"}`
	taskID, _ := q.Enqueue("undeploy", "test-undeploy-1234567890", payload)

	tsk := waitForTask(t, database, taskID, 5*time.Second)
	if tsk.Status != task.StatusCompleted {
		t.Fatalf("expected completed, got %s: %s", tsk.Status, tsk.Result)
	}

	// App should be deleted
	deletedApp, _ := db.GetApp(database, "test-undeploy-1234567890")
	if deletedApp != nil {
		t.Error("app should have been deleted after undeploy")
	}

	// Verify Docker calls
	hasStop, hasRemove := false, false
	for _, call := range mock.Calls {
		if call.Method == "StopContainer" {
			hasStop = true
		}
		if call.Method == "RemoveContainer" {
			hasRemove = true
		}
	}
	if !hasStop {
		t.Error("expected StopContainer call")
	}
	if !hasRemove {
		t.Error("expected RemoveContainer call")
	}
}
