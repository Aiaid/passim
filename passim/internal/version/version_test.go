package version

import "testing"

func TestDefaults(t *testing.T) {
	if Version != "dev" {
		t.Errorf("expected default Version 'dev', got %q", Version)
	}
	if Commit != "unknown" {
		t.Errorf("expected default Commit 'unknown', got %q", Commit)
	}
	if BuildTime != "unknown" {
		t.Errorf("expected default BuildTime 'unknown', got %q", BuildTime)
	}
}
