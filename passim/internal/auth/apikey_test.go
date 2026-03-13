package auth

import (
	"strings"
	"testing"
)

func TestGenerateAPIKey(t *testing.T) {
	plain, hash, err := GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(plain, "psk_") {
		t.Fatalf("expected psk_ prefix, got %s", plain[:4])
	}
	// psk_ + 64 hex chars = 68
	if len(plain) != 68 {
		t.Fatalf("expected 68 chars, got %d", len(plain))
	}
	if hash == "" {
		t.Fatal("hash should not be empty")
	}
}

func TestVerifyAPIKey(t *testing.T) {
	plain, hash, err := GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}

	if !VerifyAPIKey(plain, hash) {
		t.Fatal("expected valid key to verify")
	}

	if VerifyAPIKey("psk_wrong", hash) {
		t.Fatal("expected wrong key to fail")
	}
}

func TestHashDeterministic(t *testing.T) {
	key := "psk_test123"
	h1 := HashAPIKey(key)
	h2 := HashAPIKey(key)
	if h1 != h2 {
		t.Fatal("hash should be deterministic")
	}
}
