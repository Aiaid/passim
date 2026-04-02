package api

import (
	"testing"
)

func TestVersionPattern(t *testing.T) {
	valid := []string{
		"v1.0.0",
		"v0.7.0",
		"1.2.3",
		"v1.0.0-rc.1",
		"v2.0.0-beta.3",
		"dev",
		"dev-abc123",
		"dev-cd2f98c6f68088fc0ed5c7452431d6d6663d3c5c",
		"latest",
	}
	for _, v := range valid {
		if !versionPattern.MatchString(v) {
			t.Errorf("expected %q to be valid", v)
		}
	}

	invalid := []string{
		"",
		"hello",
		"v1",
		"v1.0",
		"ubuntu:latest",
		"ghcr.io/aiaid/passim:dev",
		"; rm -rf /",
		"v1.0.0 && echo pwned",
		"latest; cat /etc/passwd",
		"dev; whoami",
		"../../../etc/passwd",
	}
	for _, v := range invalid {
		if versionPattern.MatchString(v) {
			t.Errorf("expected %q to be invalid", v)
		}
	}
}
