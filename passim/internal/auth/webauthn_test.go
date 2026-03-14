package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-webauthn/webauthn/webauthn"
)

// Compile-time check: PassimUser must implement webauthn.User.
var _ webauthn.User = (*PassimUser)(nil)

func TestNewWebAuthnManager(t *testing.T) {
	mgr, err := NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mgr == nil {
		t.Fatal("expected non-nil manager")
	}
}

func TestNewWebAuthnManagerInvalid(t *testing.T) {
	_, err := NewWebAuthnManager("localhost", "")
	if err == nil {
		t.Fatal("expected error for empty rpOrigin")
	}
}

func TestPassimUserInterface(t *testing.T) {
	user := &PassimUser{
		ID:          []byte("test-user-id"),
		Credentials: nil,
	}

	if string(user.WebAuthnID()) != "test-user-id" {
		t.Fatalf("expected 'test-user-id', got '%s'", string(user.WebAuthnID()))
	}
	if user.WebAuthnName() != "admin" {
		t.Fatalf("expected 'admin', got '%s'", user.WebAuthnName())
	}
	if user.WebAuthnDisplayName() != "Admin" {
		t.Fatalf("expected 'Admin', got '%s'", user.WebAuthnDisplayName())
	}
	if user.WebAuthnCredentials() != nil {
		t.Fatal("expected nil credentials")
	}
}

func TestBeginRegistration(t *testing.T) {
	mgr, err := NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatal(err)
	}

	user := &PassimUser{
		ID:          []byte("admin-id"),
		Credentials: nil,
	}

	creation, err := mgr.BeginRegistration(user)
	if err != nil {
		t.Fatalf("begin registration failed: %v", err)
	}
	if creation == nil {
		t.Fatal("expected non-nil credential creation options")
	}

	// Verify session was stored in challenges map
	val, ok := mgr.challenges.Load(string(user.ID))
	if !ok {
		t.Fatal("expected challenge session to be stored")
	}
	if val == nil {
		t.Fatal("expected non-nil session data")
	}
}

func TestFinishRegistrationNoChallenge(t *testing.T) {
	mgr, err := NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatal(err)
	}

	user := &PassimUser{
		ID:          []byte("admin-id"),
		Credentials: nil,
	}

	// Do NOT call BeginRegistration — go straight to Finish
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")

	_, err = mgr.FinishRegistration(user, req)
	if err == nil {
		t.Fatal("expected error when no challenge exists")
	}
	if !strings.Contains(err.Error(), "no registration challenge found") {
		t.Fatalf("expected 'no registration challenge found', got: %v", err)
	}
}

func TestBeginLogin(t *testing.T) {
	mgr, err := NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatal(err)
	}

	// User must have at least one credential for BeginLogin to succeed
	user := &PassimUser{
		ID: []byte("admin-id"),
		Credentials: []webauthn.Credential{
			{
				ID:              []byte("cred-1"),
				PublicKey:       []byte("fake-public-key"),
				AttestationType: "none",
			},
		},
	}

	assertion, err := mgr.BeginLogin(user)
	if err != nil {
		t.Fatalf("begin login failed: %v", err)
	}
	if assertion == nil {
		t.Fatal("expected non-nil assertion options")
	}

	// Verify session was stored
	val, ok := mgr.challenges.Load(string(user.ID))
	if !ok {
		t.Fatal("expected challenge session to be stored")
	}
	if val == nil {
		t.Fatal("expected non-nil session data")
	}
}

func TestFinishLoginNoChallenge(t *testing.T) {
	mgr, err := NewWebAuthnManager("localhost", "https://localhost:8443")
	if err != nil {
		t.Fatal(err)
	}

	user := &PassimUser{
		ID: []byte("admin-id"),
		Credentials: []webauthn.Credential{
			{
				ID:              []byte("cred-1"),
				PublicKey:       []byte("fake-public-key"),
				AttestationType: "none",
			},
		},
	}

	// Do NOT call BeginLogin — go straight to Finish
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")

	_, err = mgr.FinishLogin(user, req)
	if err == nil {
		t.Fatal("expected error when no challenge exists")
	}
	if !strings.Contains(err.Error(), "no login challenge found") {
		t.Fatalf("expected 'no login challenge found', got: %v", err)
	}
}
