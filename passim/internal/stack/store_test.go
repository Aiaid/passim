package stack

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/passim/passim/internal/db"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestInsertAndGet(t *testing.T) {
	database := testDB(t)

	s := &Stack{
		ID:       "s1",
		Name:     "mystack",
		YAMLText: "services:\n  web:\n    image: nginx",
		EnvText:  "FOO=bar",
		Profiles: []string{"debug"},
	}
	if err := Insert(database, s); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if s.Status != StatusStopped {
		t.Errorf("status = %q, want stopped", s.Status)
	}
	if s.CreatedAt == "" {
		t.Error("created_at not set")
	}

	got, err := Get(database, "s1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatal("got nil")
	}
	if got.Name != "mystack" || got.YAMLText != s.YAMLText {
		t.Errorf("mismatch: %+v", got)
	}
	if len(got.Profiles) != 1 || got.Profiles[0] != "debug" {
		t.Errorf("profiles = %v", got.Profiles)
	}
}

func TestGetNonexistent(t *testing.T) {
	database := testDB(t)
	got, err := Get(database, "missing")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != nil {
		t.Errorf("got non-nil: %+v", got)
	}
}

func TestGetByName(t *testing.T) {
	database := testDB(t)
	s := &Stack{ID: "s1", Name: "unique", YAMLText: "x"}
	if err := Insert(database, s); err != nil {
		t.Fatalf("insert: %v", err)
	}
	got, err := GetByName(database, "unique")
	if err != nil || got == nil || got.ID != "s1" {
		t.Errorf("lookup failed: %v %+v", err, got)
	}
}

func TestUniqueName(t *testing.T) {
	database := testDB(t)
	_ = Insert(database, &Stack{ID: "a", Name: "dup", YAMLText: "x"})
	err := Insert(database, &Stack{ID: "b", Name: "dup", YAMLText: "x"})
	if err == nil {
		t.Error("expected UNIQUE constraint error")
	}
}

func TestList(t *testing.T) {
	database := testDB(t)
	_ = Insert(database, &Stack{ID: "a", Name: "one", YAMLText: "x"})
	_ = Insert(database, &Stack{ID: "b", Name: "two", YAMLText: "x"})
	stacks, err := List(database)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(stacks) != 2 {
		t.Errorf("len = %d", len(stacks))
	}
}

func TestUpdateStatus(t *testing.T) {
	database := testDB(t)
	_ = Insert(database, &Stack{ID: "s", Name: "s", YAMLText: "x"})

	if err := UpdateStatus(database, "s", StatusError, "oops"); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ := Get(database, "s")
	if got.Status != StatusError || got.LastError != "oops" {
		t.Errorf("status=%q err=%q", got.Status, got.LastError)
	}

	// Clearing last_error
	if err := UpdateStatus(database, "s", StatusRunning, ""); err != nil {
		t.Fatalf("update2: %v", err)
	}
	got, _ = Get(database, "s")
	if got.Status != StatusRunning || got.LastError != "" {
		t.Errorf("clear failed: status=%q err=%q", got.Status, got.LastError)
	}
}

func TestUpdateYAML(t *testing.T) {
	database := testDB(t)
	_ = Insert(database, &Stack{ID: "s", Name: "s", YAMLText: "old"})
	if err := UpdateYAML(database, "s", "new", "FOO=1", []string{"p1"}); err != nil {
		t.Fatalf("update yaml: %v", err)
	}
	got, _ := Get(database, "s")
	if got.YAMLText != "new" || got.EnvText != "FOO=1" || len(got.Profiles) != 1 {
		t.Errorf("mismatch: %+v", got)
	}
}

func TestDelete(t *testing.T) {
	database := testDB(t)
	_ = Insert(database, &Stack{ID: "s", Name: "s", YAMLText: "x"})
	if err := Delete(database, "s"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	got, _ := Get(database, "s")
	if got != nil {
		t.Error("still exists")
	}
}
