package setup

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

func TestInitFirstTime(t *testing.T) {
	database := testDB(t)

	if err := Init(database); err != nil {
		t.Fatal(err)
	}

	// Verify config values were created
	for _, key := range []string{"node_id", "api_key_hash", "jwt_secret", "auth_version"} {
		val, err := db.GetConfig(database, key)
		if err != nil {
			t.Fatalf("get %s: %v", key, err)
		}
		if val == "" {
			t.Fatalf("%s should not be empty", key)
		}
	}

	// auth_version should be "1"
	v, _ := db.GetConfig(database, "auth_version")
	if v != "1" {
		t.Fatalf("expected auth_version 1, got %s", v)
	}
}

func TestInitIdempotent(t *testing.T) {
	database := testDB(t)

	if err := Init(database); err != nil {
		t.Fatal(err)
	}

	// Capture values after first init
	nodeID, _ := db.GetConfig(database, "node_id")
	hash, _ := db.GetConfig(database, "api_key_hash")

	// Run again — should be no-op
	if err := Init(database); err != nil {
		t.Fatal(err)
	}

	nodeID2, _ := db.GetConfig(database, "node_id")
	hash2, _ := db.GetConfig(database, "api_key_hash")

	if nodeID != nodeID2 {
		t.Fatal("node_id changed on second init")
	}
	if hash != hash2 {
		t.Fatal("api_key_hash changed on second init")
	}
}
