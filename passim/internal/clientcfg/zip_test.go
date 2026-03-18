package clientcfg

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestGenerateZIPSingleNode(t *testing.T) {
	configs := []ResolvedConfig{
		{
			Type:     "file_per_user",
			NodeName: "local",
			Files: []ResolvedFile{
				{Index: 1, Name: "peer1.conf", Content: "[Interface]\nKey=1"},
				{Index: 2, Name: "peer2.conf", Content: "[Interface]\nKey=2"},
			},
		},
	}

	data, err := GenerateZIP(configs)
	if err != nil {
		t.Fatalf("GenerateZIP() error: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}

	if len(r.File) != 2 {
		t.Fatalf("zip entries = %d, want 2", len(r.File))
	}

	// Single node: files at root level
	if r.File[0].Name != "peer1.conf" {
		t.Errorf("entry[0] = %q, want peer1.conf", r.File[0].Name)
	}
	if r.File[1].Name != "peer2.conf" {
		t.Errorf("entry[1] = %q, want peer2.conf", r.File[1].Name)
	}
}

func TestGenerateZIPMultiNode(t *testing.T) {
	configs := []ResolvedConfig{
		{
			Type:        "file_per_user",
			NodeName:    "tokyo-1",
			NodeCountry: "JP",
			Files: []ResolvedFile{
				{Index: 1, Name: "peer1.conf", Content: "tokyo-peer1"},
			},
		},
		{
			Type:        "file_per_user",
			NodeName:    "singapore-1",
			NodeCountry: "SG",
			Files: []ResolvedFile{
				{Index: 1, Name: "peer1.conf", Content: "sg-peer1"},
			},
		},
	}

	data, err := GenerateZIP(configs)
	if err != nil {
		t.Fatalf("GenerateZIP() error: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}

	if len(r.File) != 2 {
		t.Fatalf("zip entries = %d, want 2", len(r.File))
	}

	// Multi-node: organized by node with country flag prefix
	if r.File[0].Name != "🇯🇵tokyo-1/peer1.conf" {
		t.Errorf("entry[0] = %q, want 🇯🇵tokyo-1/peer1.conf", r.File[0].Name)
	}
	if r.File[1].Name != "🇸🇬singapore-1/peer1.conf" {
		t.Errorf("entry[1] = %q, want 🇸🇬singapore-1/peer1.conf", r.File[1].Name)
	}
}

func TestCountryFlag(t *testing.T) {
	tests := []struct {
		code     string
		expected string
	}{
		{"JP", "🇯🇵"},
		{"US", "🇺🇸"},
		{"SG", "🇸🇬"},
		{"CN", "🇨🇳"},
		{"", ""},
		{"A", ""},
	}

	for _, tt := range tests {
		result := countryFlag(tt.code)
		if result != tt.expected {
			t.Errorf("countryFlag(%q) = %q, want %q", tt.code, result, tt.expected)
		}
	}
}

func TestGenerateZIPSkipsNonFilePerUser(t *testing.T) {
	configs := []ResolvedConfig{
		{Type: "credentials"},
		{Type: "url"},
	}

	data, err := GenerateZIP(configs)
	if err != nil {
		t.Fatalf("GenerateZIP() error: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}

	if len(r.File) != 0 {
		t.Errorf("expected empty zip, got %d entries", len(r.File))
	}
}
