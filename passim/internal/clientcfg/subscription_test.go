package clientcfg

import (
	"strings"
	"testing"
)

func TestGenerateClashYAML(t *testing.T) {
	configs := []ResolvedConfig{
		{
			Type:     "url",
			NodeName: "tokyo-1",
			URLs: []ResolvedURL{
				{Name: "Hysteria 2", URI: "hysteria2://pass123@1.2.3.4:443/?insecure=1#tokyo-1", QR: true},
			},
		},
		{
			Type:     "url",
			NodeName: "singapore-1",
			URLs: []ResolvedURL{
				{Name: "Hysteria 2", URI: "hysteria2://pass123@5.6.7.8:443/?insecure=1#singapore-1", QR: true},
			},
		},
	}

	yaml, err := GenerateClashYAML(configs)
	if err != nil {
		t.Fatalf("GenerateClashYAML() error: %v", err)
	}

	s := string(yaml)

	if !strings.Contains(s, "proxies:") {
		t.Error("missing proxies section")
	}
	if !strings.Contains(s, "tokyo-1") {
		t.Error("missing tokyo-1 proxy")
	}
	if !strings.Contains(s, "singapore-1") {
		t.Error("missing singapore-1 proxy")
	}
	if !strings.Contains(s, "type: hysteria2") {
		t.Error("missing hysteria2 type")
	}
	if !strings.Contains(s, "server: 1.2.3.4") {
		t.Error("missing tokyo server")
	}
	if !strings.Contains(s, "server: 5.6.7.8") {
		t.Error("missing singapore server")
	}
	if !strings.Contains(s, "proxy-groups:") {
		t.Error("missing proxy-groups section")
	}
	if !strings.Contains(s, "type: url-test") {
		t.Error("missing url-test type")
	}
}

func TestGenerateClashYAMLEmpty(t *testing.T) {
	yaml, err := GenerateClashYAML(nil)
	if err != nil {
		t.Fatalf("GenerateClashYAML() error: %v", err)
	}
	if !strings.Contains(string(yaml), "proxies: []") {
		t.Errorf("expected empty proxies, got: %s", yaml)
	}
}

func TestGenerateClashYAMLSkipsNonURL(t *testing.T) {
	configs := []ResolvedConfig{
		{Type: "credentials"},
		{Type: "file_per_user"},
	}

	yaml, err := GenerateClashYAML(configs)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if !strings.Contains(string(yaml), "proxies: []") {
		t.Errorf("expected empty proxies for non-url types, got: %s", yaml)
	}
}

func TestParseHysteria2URI(t *testing.T) {
	// fallbackName (NodeName) takes priority over URI fragment
	proxy, err := parseHysteria2URI("hysteria2://mypass@example.com:8443/?insecure=1&sni=example.com#my-node", "fallback")
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if proxy.Name != "fallback" {
		t.Errorf("Name = %q, want fallback (fallbackName should override fragment)", proxy.Name)
	}
	if proxy.Type != "hysteria2" {
		t.Errorf("Type = %q, want hysteria2", proxy.Type)
	}
	if proxy.Server != "example.com" {
		t.Errorf("Server = %q", proxy.Server)
	}
	if proxy.Port != 8443 {
		t.Errorf("Port = %d, want 8443", proxy.Port)
	}
	if proxy.Password != "mypass" {
		t.Errorf("Password = %q", proxy.Password)
	}
	if !proxy.Insecure {
		t.Error("Insecure should be true")
	}
	if proxy.SNI != "example.com" {
		t.Errorf("SNI = %q", proxy.SNI)
	}
}

func TestParseHysteria2URI_NoFallback(t *testing.T) {
	// When fallbackName is empty, use URI fragment
	proxy, err := parseHysteria2URI("hysteria2://mypass@example.com:8443/?insecure=1#my-node", "")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if proxy.Name != "my-node" {
		t.Errorf("Name = %q, want my-node (should use fragment when no fallback)", proxy.Name)
	}
}

func TestParseHysteria2URI_NoFallbackNoFragment(t *testing.T) {
	// When both are empty, use host
	proxy, err := parseHysteria2URI("hysteria2://mypass@example.com:8443/?insecure=1", "")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if proxy.Name != "example.com" {
		t.Errorf("Name = %q, want example.com (should use host as last resort)", proxy.Name)
	}
}

func TestParseVMessURI(t *testing.T) {
	// fallbackName takes priority over URI fragment
	proxy, err := parseVMessURI("vmess://550e8400-e29b-41d4-a716-446655440000@10.0.0.1:10086?alterId=0#v2ray-node", "fallback")
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if proxy.Name != "fallback" {
		t.Errorf("Name = %q, want fallback", proxy.Name)
	}
	if proxy.Type != "vmess" {
		t.Errorf("Type = %q", proxy.Type)
	}
	if proxy.Server != "10.0.0.1" {
		t.Errorf("Server = %q", proxy.Server)
	}
	if proxy.Port != 10086 {
		t.Errorf("Port = %d", proxy.Port)
	}
	if proxy.UUID != "550e8400-e29b-41d4-a716-446655440000" {
		t.Errorf("UUID = %q", proxy.UUID)
	}
	if proxy.AlterID != 0 {
		t.Errorf("AlterID = %d", proxy.AlterID)
	}
}

func TestParseUnsupportedScheme(t *testing.T) {
	_, err := parseURIToClashProxy("unknown://foo", "node")
	if err == nil {
		t.Error("expected error for unsupported scheme")
	}
}
