package task

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/db"
)

func testDB(t *testing.T) *sql.DB {
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

func TestInsertAndGet(t *testing.T) {
	database := testDB(t)

	task := &Task{
		ID:         "task-001",
		Type:       "deploy",
		Target:     "app-123",
		Payload:    `{"image":"nginx"}`,
		Status:     StatusQueued,
		MaxRetries: 3,
	}

	if err := Insert(database, task); err != nil {
		t.Fatalf("insert: %v", err)
	}

	got, err := Get(database, "task-001")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatal("get returned nil")
	}
	if got.ID != "task-001" {
		t.Errorf("id = %q", got.ID)
	}
	if got.Type != "deploy" {
		t.Errorf("type = %q", got.Type)
	}
	if got.Target != "app-123" {
		t.Errorf("target = %q", got.Target)
	}
	if got.Payload != `{"image":"nginx"}` {
		t.Errorf("payload = %q", got.Payload)
	}
	if got.Status != StatusQueued {
		t.Errorf("status = %q", got.Status)
	}
	if got.MaxRetries != 3 {
		t.Errorf("max_retries = %d", got.MaxRetries)
	}
}

func TestGetNonexistent(t *testing.T) {
	database := testDB(t)

	got, err := Get(database, "nonexistent")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != nil {
		t.Error("expected nil for nonexistent task")
	}
}

func TestListTasks(t *testing.T) {
	database := testDB(t)

	for _, id := range []string{"task-a", "task-b", "task-c"} {
		if err := Insert(database, &Task{
			ID:         id,
			Type:       "deploy",
			Payload:    "{}",
			Status:     StatusQueued,
			MaxRetries: 3,
		}); err != nil {
			t.Fatal(err)
		}
	}

	tasks, err := List(database)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(tasks) != 3 {
		t.Errorf("expected 3 tasks, got %d", len(tasks))
	}
}

func TestUpdateStatus(t *testing.T) {
	database := testDB(t)

	task := &Task{
		ID:         "task-upd",
		Type:       "deploy",
		Payload:    "{}",
		Status:     StatusQueued,
		MaxRetries: 3,
	}
	if err := Insert(database, task); err != nil {
		t.Fatal(err)
	}

	// Mark as completed
	if err := UpdateStatus(database, "task-upd", StatusCompleted, "", 0); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := Get(database, "task-upd")
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
	if got.FinishedAt == "" {
		t.Error("finished_at should be set")
	}
}

func TestUpdateStatusFailed(t *testing.T) {
	database := testDB(t)

	task := &Task{
		ID:         "task-fail",
		Type:       "deploy",
		Payload:    "{}",
		Status:     StatusQueued,
		MaxRetries: 3,
	}
	if err := Insert(database, task); err != nil {
		t.Fatal(err)
	}

	if err := UpdateStatus(database, "task-fail", StatusFailed, "something broke", 3); err != nil {
		t.Fatal(err)
	}

	got, _ := Get(database, "task-fail")
	if got.Status != StatusFailed {
		t.Errorf("status = %q", got.Status)
	}
	if got.Result != "something broke" {
		t.Errorf("result = %q", got.Result)
	}
	if got.Retries != 3 {
		t.Errorf("retries = %d", got.Retries)
	}
	if got.FinishedAt == "" {
		t.Error("finished_at should be set for failed tasks")
	}
}

func TestRecoverPending(t *testing.T) {
	database := testDB(t)

	// Insert a queued task and a running task
	Insert(database, &Task{ID: "t-queued", Type: "deploy", Payload: "{}", Status: StatusQueued, MaxRetries: 3})
	Insert(database, &Task{ID: "t-running", Type: "deploy", Payload: "{}", Status: StatusRunning, MaxRetries: 3})
	Insert(database, &Task{ID: "t-done", Type: "deploy", Payload: "{}", Status: StatusCompleted, MaxRetries: 3})

	// Manually mark the running one (already inserted as running via raw SQL)
	// The INSERT above puts it as "running", so RecoverPending should reset it.

	recovered, err := RecoverPending(database)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}

	// Should get back 2 queued tasks (the originally queued one + the recovered running one)
	if len(recovered) != 2 {
		t.Errorf("expected 2 recovered tasks, got %d", len(recovered))
	}

	// Verify the previously-running task is now queued
	got, _ := Get(database, "t-running")
	if got.Status != StatusQueued {
		t.Errorf("t-running status = %q, want queued", got.Status)
	}

	// Completed task should be untouched
	done, _ := Get(database, "t-done")
	if done.Status != StatusCompleted {
		t.Errorf("t-done status = %q, want completed", done.Status)
	}
}
