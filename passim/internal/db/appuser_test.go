package db

import (
	"testing"
)

func TestCreateAppUser(t *testing.T) {
	database := setupTestDB(t)

	u := &AppUser{
		ID:         "u-001",
		AppID:      "app-001",
		Username:   "alice",
		Password:   "secret123",
		Enabled:    true,
		QuotaBytes: 1024 * 1024 * 1024, // 1 GB
	}

	if err := CreateAppUser(database, u); err != nil {
		t.Fatal(err)
	}

	got, err := GetAppUser(database, "u-001")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("user not found")
	}
	if got.Username != "alice" {
		t.Errorf("username = %q, want alice", got.Username)
	}
	if got.Password != "secret123" {
		t.Errorf("password = %q, want secret123", got.Password)
	}
	if !got.Enabled {
		t.Error("enabled should be true")
	}
	if got.QuotaBytes != 1024*1024*1024 {
		t.Errorf("quota_bytes = %d", got.QuotaBytes)
	}
	if got.CreatedAt == "" {
		t.Error("created_at should be set")
	}
}

func TestCreateAppUserDuplicate(t *testing.T) {
	database := setupTestDB(t)

	u := &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw1", Enabled: true}
	if err := CreateAppUser(database, u); err != nil {
		t.Fatal(err)
	}

	// Same app_id + username should fail
	u2 := &AppUser{ID: "u-002", AppID: "app-001", Username: "alice", Password: "pw2", Enabled: true}
	if err := CreateAppUser(database, u2); err == nil {
		t.Fatal("expected error for duplicate app_id+username")
	}

	// Same username, different app_id should succeed
	u3 := &AppUser{ID: "u-003", AppID: "app-002", Username: "alice", Password: "pw3", Enabled: true}
	if err := CreateAppUser(database, u3); err != nil {
		t.Fatalf("should allow same username in different app: %v", err)
	}
}

func TestGetAppUserByUsername(t *testing.T) {
	database := setupTestDB(t)

	u := &AppUser{ID: "u-001", AppID: "app-001", Username: "bob", Password: "pw", Enabled: true}
	CreateAppUser(database, u)

	got, err := GetAppUserByUsername(database, "app-001", "bob")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("user not found")
	}
	if got.ID != "u-001" {
		t.Errorf("id = %q, want u-001", got.ID)
	}

	// Not found
	got, err = GetAppUserByUsername(database, "app-001", "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil for nonexistent user")
	}
}

func TestListAppUsers(t *testing.T) {
	database := setupTestDB(t)

	CreateAppUser(database, &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw", Enabled: true})
	CreateAppUser(database, &AppUser{ID: "u-002", AppID: "app-001", Username: "bob", Password: "pw", Enabled: true})
	CreateAppUser(database, &AppUser{ID: "u-003", AppID: "app-002", Username: "carol", Password: "pw", Enabled: true})

	users, err := ListAppUsers(database, "app-001")
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Fatalf("len = %d, want 2", len(users))
	}

	// Empty list
	users, err = ListAppUsers(database, "app-999")
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 0 {
		t.Fatalf("len = %d, want 0", len(users))
	}
}

func TestUpdateAppUser(t *testing.T) {
	database := setupTestDB(t)

	CreateAppUser(database, &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "old", Enabled: true, QuotaBytes: 0})

	// Update password and enabled
	err := UpdateAppUser(database, "u-001", map[string]interface{}{
		"password": "new",
		"enabled":  false,
	})
	if err != nil {
		t.Fatal(err)
	}

	got, _ := GetAppUser(database, "u-001")
	if got.Password != "new" {
		t.Errorf("password = %q, want new", got.Password)
	}
	if got.Enabled {
		t.Error("enabled should be false")
	}

	// Update quota
	err = UpdateAppUser(database, "u-001", map[string]interface{}{
		"quota_bytes": int64(5000),
	})
	if err != nil {
		t.Fatal(err)
	}
	got, _ = GetAppUser(database, "u-001")
	if got.QuotaBytes != 5000 {
		t.Errorf("quota_bytes = %d, want 5000", got.QuotaBytes)
	}

	// Empty fields is a no-op
	err = UpdateAppUser(database, "u-001", map[string]interface{}{})
	if err != nil {
		t.Fatal(err)
	}

	// Unknown field
	err = UpdateAppUser(database, "u-001", map[string]interface{}{"bad_field": "x"})
	if err == nil {
		t.Error("expected error for unknown field")
	}

	// Nonexistent user
	err = UpdateAppUser(database, "u-999", map[string]interface{}{"password": "x"})
	if err == nil {
		t.Error("expected error for nonexistent user")
	}
}

func TestDeleteAppUser(t *testing.T) {
	database := setupTestDB(t)

	CreateAppUser(database, &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw", Enabled: true})

	if err := DeleteAppUser(database, "u-001"); err != nil {
		t.Fatal(err)
	}

	got, _ := GetAppUser(database, "u-001")
	if got != nil {
		t.Error("user should be deleted")
	}

	// Delete nonexistent
	if err := DeleteAppUser(database, "u-999"); err == nil {
		t.Error("expected error deleting nonexistent user")
	}
}

func TestDeleteAppUsersByApp(t *testing.T) {
	database := setupTestDB(t)

	CreateAppUser(database, &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw", Enabled: true})
	CreateAppUser(database, &AppUser{ID: "u-002", AppID: "app-001", Username: "bob", Password: "pw", Enabled: true})
	CreateAppUser(database, &AppUser{ID: "u-003", AppID: "app-002", Username: "carol", Password: "pw", Enabled: true})

	if err := DeleteAppUsersByApp(database, "app-001"); err != nil {
		t.Fatal(err)
	}

	users, _ := ListAppUsers(database, "app-001")
	if len(users) != 0 {
		t.Errorf("len = %d, want 0 after delete by app", len(users))
	}

	// app-002 should be unaffected
	users, _ = ListAppUsers(database, "app-002")
	if len(users) != 1 {
		t.Errorf("len = %d, want 1 for unaffected app", len(users))
	}

	// Deleting for app with no users should not error
	if err := DeleteAppUsersByApp(database, "app-999"); err != nil {
		t.Fatal(err)
	}
}

func TestCountAppUsers(t *testing.T) {
	database := setupTestDB(t)

	count, err := CountAppUsers(database, "app-001")
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}

	CreateAppUser(database, &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw", Enabled: true})
	CreateAppUser(database, &AppUser{ID: "u-002", AppID: "app-001", Username: "bob", Password: "pw", Enabled: true})

	count, err = CountAppUsers(database, "app-001")
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

func TestAppUserEnabledBool(t *testing.T) {
	database := setupTestDB(t)

	// Create disabled user
	u := &AppUser{ID: "u-001", AppID: "app-001", Username: "alice", Password: "pw", Enabled: false}
	CreateAppUser(database, u)

	got, _ := GetAppUser(database, "u-001")
	if got.Enabled {
		t.Error("enabled should be false")
	}

	// Enable via update
	UpdateAppUser(database, "u-001", map[string]interface{}{"enabled": true})
	got, _ = GetAppUser(database, "u-001")
	if !got.Enabled {
		t.Error("enabled should be true after update")
	}
}
