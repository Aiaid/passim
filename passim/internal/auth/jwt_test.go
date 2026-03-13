package auth

import (
	"testing"
	"time"
)

func TestGenerateSecret(t *testing.T) {
	s, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	if len(s) != 64 { // 32 bytes hex-encoded
		t.Fatalf("expected 64 hex chars, got %d", len(s))
	}
}

func TestIssueAndVerify(t *testing.T) {
	mgr := NewJWTManager("test-secret-key-for-testing-only", 1*time.Hour)

	token, exp, err := mgr.Issue(1)
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("empty token")
	}
	if exp.Before(time.Now()) {
		t.Fatal("expiry should be in the future")
	}

	claims, err := mgr.Verify(token)
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	if claims.AuthVersion != 1 {
		t.Fatalf("expected auth_version 1, got %d", claims.AuthVersion)
	}
	if claims.Issuer != "passim" {
		t.Fatalf("expected issuer passim, got %s", claims.Issuer)
	}
}

func TestVerifyExpired(t *testing.T) {
	mgr := NewJWTManager("test-secret-key-for-testing-only", -1*time.Hour)

	token, _, err := mgr.Issue(1)
	if err != nil {
		t.Fatal(err)
	}

	_, err = mgr.Verify(token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestVerifyWrongSecret(t *testing.T) {
	mgr1 := NewJWTManager("secret-one", 1*time.Hour)
	mgr2 := NewJWTManager("secret-two", 1*time.Hour)

	token, _, err := mgr1.Issue(1)
	if err != nil {
		t.Fatal(err)
	}

	_, err = mgr2.Verify(token)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestAuthVersionInClaims(t *testing.T) {
	mgr := NewJWTManager("test-secret", 1*time.Hour)

	for _, v := range []int{1, 2, 5, 100} {
		token, _, err := mgr.Issue(v)
		if err != nil {
			t.Fatal(err)
		}
		claims, err := mgr.Verify(token)
		if err != nil {
			t.Fatal(err)
		}
		if claims.AuthVersion != v {
			t.Fatalf("expected auth_version %d, got %d", v, claims.AuthVersion)
		}
	}
}
