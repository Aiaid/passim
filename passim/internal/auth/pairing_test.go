package auth

import (
	"testing"
	"time"
)

func TestGeneratePairingToken(t *testing.T) {
	token, err := GeneratePairingToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(token) < 5 || token[:4] != "ptk_" {
		t.Fatalf("token should start with ptk_, got %q", token)
	}

	// Each call produces a unique token.
	token2, _ := GeneratePairingToken()
	if token == token2 {
		t.Fatal("tokens should be unique")
	}
}

func TestPairingStoreVerify(t *testing.T) {
	s := NewPairingStore()
	token, _ := GeneratePairingToken()
	s.Store(token, 5*time.Minute)

	if !s.Verify(token) {
		t.Fatal("should verify stored token")
	}
	// One-time use: second verify must fail.
	if s.Verify(token) {
		t.Fatal("should not verify consumed token")
	}
}

func TestPairingStoreExpiry(t *testing.T) {
	s := NewPairingStore()
	token, _ := GeneratePairingToken()
	s.Store(token, 1*time.Millisecond)

	time.Sleep(5 * time.Millisecond)

	if s.Verify(token) {
		t.Fatal("expired token should not verify")
	}
}

func TestPairingStoreWrongToken(t *testing.T) {
	s := NewPairingStore()
	token, _ := GeneratePairingToken()
	s.Store(token, 5*time.Minute)

	if s.Verify("ptk_wrong") {
		t.Fatal("wrong token should not verify")
	}
	// Original token should still be valid.
	if !s.Verify(token) {
		t.Fatal("original token should still verify after wrong attempt")
	}
}
