package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	database, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(database); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		os.Remove(path)
	})
	return database
}

func TestConfigRoundTrip(t *testing.T) {
	database := setupTestDB(t)

	if err := SetConfig(database, "test_key", "test_value"); err != nil {
		t.Fatal(err)
	}

	val, err := GetConfig(database, "test_key")
	if err != nil {
		t.Fatal(err)
	}
	if val != "test_value" {
		t.Errorf("got %q, want test_value", val)
	}

	// Update
	SetConfig(database, "test_key", "updated")
	val, _ = GetConfig(database, "test_key")
	if val != "updated" {
		t.Errorf("got %q, want updated", val)
	}

	// Missing key
	val, err = GetConfig(database, "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if val != "" {
		t.Errorf("got %q, want empty", val)
	}
}

func TestAppCRUD(t *testing.T) {
	database := setupTestDB(t)

	app := &App{
		ID:       "app-001",
		Template: "wireguard",
		Settings: `{"peers":3}`,
		Status:   "running",
		ContainerID: "abc123",
	}

	// Create
	if err := CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	// Get
	got, err := GetApp(database, "app-001")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("app not found")
	}
	if got.Template != "wireguard" {
		t.Errorf("template = %q", got.Template)
	}
	if got.Settings != `{"peers":3}` {
		t.Errorf("settings = %q", got.Settings)
	}
	if got.Status != "running" {
		t.Errorf("status = %q", got.Status)
	}
	if got.ContainerID != "abc123" {
		t.Errorf("container_id = %q", got.ContainerID)
	}
	if got.DeployedAt == "" {
		t.Error("deployed_at should be set")
	}

	// List
	apps, err := ListApps(database)
	if err != nil {
		t.Fatal(err)
	}
	if len(apps) != 1 {
		t.Fatalf("len = %d, want 1", len(apps))
	}

	// Update status
	if err := UpdateApp(database, "app-001", "stopped", ""); err != nil {
		t.Fatal(err)
	}
	got, _ = GetApp(database, "app-001")
	if got.Status != "stopped" {
		t.Errorf("status = %q, want stopped", got.Status)
	}

	// Update settings
	if err := UpdateAppSettings(database, "app-001", `{"peers":5}`); err != nil {
		t.Fatal(err)
	}
	got, _ = GetApp(database, "app-001")
	if got.Settings != `{"peers":5}` {
		t.Errorf("settings = %q", got.Settings)
	}

	// Delete
	if err := DeleteApp(database, "app-001"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetApp(database, "app-001")
	if got != nil {
		t.Error("app should be deleted")
	}

	// Delete nonexistent
	if err := DeleteApp(database, "nope"); err == nil {
		t.Error("expected error deleting nonexistent app")
	}
}

func TestGetApp_NotFound(t *testing.T) {
	database := setupTestDB(t)
	got, err := GetApp(database, "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil")
	}
}
