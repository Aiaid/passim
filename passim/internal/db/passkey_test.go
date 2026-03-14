package db

import (
	"testing"
)

func TestPasskeyCRUD(t *testing.T) {
	database := setupTestDB(t)

	// HasPasskeys returns false when empty
	has, err := HasPasskeys(database)
	if err != nil {
		t.Fatal(err)
	}
	if has {
		t.Error("expected no passkeys")
	}

	// Create
	pk := &Passkey{
		ID:           "pk-001",
		CredentialID: []byte("cred-id-bytes"),
		PublicKey:    []byte("pub-key-bytes"),
		Name:         "My Passkey",
		SignCount:    0,
	}
	if err := CreatePasskey(database, pk); err != nil {
		t.Fatal(err)
	}

	// HasPasskeys returns true
	has, err = HasPasskeys(database)
	if err != nil {
		t.Fatal(err)
	}
	if !has {
		t.Error("expected passkeys to exist")
	}

	// Get by ID
	got, err := GetPasskey(database, "pk-001")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("passkey not found")
	}
	if got.Name != "My Passkey" {
		t.Errorf("name = %q, want My Passkey", got.Name)
	}
	if string(got.CredentialID) != "cred-id-bytes" {
		t.Errorf("credential_id = %q", got.CredentialID)
	}
	if string(got.PublicKey) != "pub-key-bytes" {
		t.Errorf("public_key = %q", got.PublicKey)
	}
	if got.SignCount != 0 {
		t.Errorf("sign_count = %d, want 0", got.SignCount)
	}
	if got.CreatedAt == "" {
		t.Error("created_at should be set")
	}

	// Get by credential ID
	got, err = GetPasskeyByCredentialID(database, []byte("cred-id-bytes"))
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("passkey not found by credential_id")
	}
	if got.ID != "pk-001" {
		t.Errorf("id = %q, want pk-001", got.ID)
	}

	// Get by credential ID not found
	got, err = GetPasskeyByCredentialID(database, []byte("nonexistent"))
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil for nonexistent credential_id")
	}

	// List
	list, err := ListPasskeys(database)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("len = %d, want 1", len(list))
	}

	// Update sign count
	if err := UpdatePasskeySignCount(database, "pk-001", 5); err != nil {
		t.Fatal(err)
	}
	got, _ = GetPasskey(database, "pk-001")
	if got.SignCount != 5 {
		t.Errorf("sign_count = %d, want 5", got.SignCount)
	}
	if got.LastUsedAt == "" {
		t.Error("last_used_at should be set after update")
	}

	// Update sign count for nonexistent
	if err := UpdatePasskeySignCount(database, "nope", 1); err == nil {
		t.Error("expected error updating nonexistent passkey")
	}

	// Delete
	if err := DeletePasskey(database, "pk-001"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetPasskey(database, "pk-001")
	if got != nil {
		t.Error("passkey should be deleted")
	}

	// Delete nonexistent
	if err := DeletePasskey(database, "nope"); err == nil {
		t.Error("expected error deleting nonexistent passkey")
	}

	// HasPasskeys returns false after delete
	has, _ = HasPasskeys(database)
	if has {
		t.Error("expected no passkeys after delete")
	}
}

func TestGetPasskey_NotFound(t *testing.T) {
	database := setupTestDB(t)
	got, err := GetPasskey(database, "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil")
	}
}

func TestCreatePasskey_DuplicateCredentialID(t *testing.T) {
	database := setupTestDB(t)

	pk1 := &Passkey{
		ID:           "pk-001",
		CredentialID: []byte("same-cred-id"),
		PublicKey:    []byte("pub-key-1"),
		Name:         "First",
	}
	if err := CreatePasskey(database, pk1); err != nil {
		t.Fatal(err)
	}

	pk2 := &Passkey{
		ID:           "pk-002",
		CredentialID: []byte("same-cred-id"),
		PublicKey:    []byte("pub-key-2"),
		Name:         "Second",
	}
	if err := CreatePasskey(database, pk2); err == nil {
		t.Error("expected error for duplicate credential_id")
	}
}
