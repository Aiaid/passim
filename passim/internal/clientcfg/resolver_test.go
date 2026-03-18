package clientcfg

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveFilePerUser(t *testing.T) {
	// Create temp directory structure simulating WireGuard peer configs
	tmpDir := t.TempDir()
	appDir := filepath.Join(tmpDir, "apps", "wireguard-abc12345")
	confDir := filepath.Join(appDir, "configs", "wg_confs")
	if err := os.MkdirAll(confDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create peer config files
	for i := 1; i <= 3; i++ {
		content := "[Interface]\nPrivateKey = key" + string(rune('0'+i))
		if err := os.WriteFile(filepath.Join(confDir, "peer"+string(rune('0'+i))+".conf"), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	clients := &ClientsDef{
		Type:   "file_per_user",
		Source: "/config/wg_confs/peer{n}.conf",
		Format: "conf",
		QR:     true,
	}

	app := AppContext{
		ID:       "abc12345-xxxx",
		Template: "wireguard",
		AppDir:   appDir,
	}
	node := NodeContext{
		PublicIP: "1.2.3.4",
		Hostname: "tokyo-1",
		Country:  "JP",
	}

	result, err := Resolve(clients, app, node)
	if err != nil {
		t.Fatalf("Resolve() error: %v", err)
	}

	if result.Type != "file_per_user" {
		t.Errorf("Type = %q, want file_per_user", result.Type)
	}
	if len(result.Files) != 3 {
		t.Fatalf("Files count = %d, want 3", len(result.Files))
	}
	if result.Files[0].Index != 1 {
		t.Errorf("Files[0].Index = %d, want 1", result.Files[0].Index)
	}
	if result.Files[0].Name != "peer1.conf" {
		t.Errorf("Files[0].Name = %q", result.Files[0].Name)
	}
	if result.Files[0].Content == "" {
		t.Error("Files[0].Content is empty")
	}
	if !result.QR {
		t.Error("QR should be true")
	}
	if result.NodeName != "tokyo-1" {
		t.Errorf("NodeName = %q", result.NodeName)
	}
}

func TestResolveCredentials(t *testing.T) {
	clients := &ClientsDef{
		Type: "credentials",
		Fields: []FieldDef{
			{Key: "server", Label: map[string]string{"en-US": "Server"}, Value: "{{node.public_ip}}"},
			{Key: "username", Label: map[string]string{"en-US": "Username"}, Value: "{{settings.vpn_user}}"},
			{Key: "password", Label: map[string]string{"en-US": "Password"}, Value: "{{settings.vpn_password}}", Secret: true},
		},
	}

	app := AppContext{
		Settings: map[string]interface{}{
			"vpn_user":     "alice",
			"vpn_password": "secret123",
		},
	}
	node := NodeContext{
		PublicIP: "10.0.0.1",
		Hostname: "sg-1",
		Country:  "SG",
	}

	result, err := Resolve(clients, app, node)
	if err != nil {
		t.Fatalf("Resolve() error: %v", err)
	}

	if result.Type != "credentials" {
		t.Errorf("Type = %q, want credentials", result.Type)
	}
	if len(result.Credentials) != 3 {
		t.Fatalf("Credentials count = %d, want 3", len(result.Credentials))
	}
	if result.Credentials[0].Value != "10.0.0.1" {
		t.Errorf("server value = %q, want 10.0.0.1", result.Credentials[0].Value)
	}
	if result.Credentials[1].Value != "alice" {
		t.Errorf("username value = %q, want alice", result.Credentials[1].Value)
	}
	if result.Credentials[2].Value != "secret123" {
		t.Errorf("password value = %q, want secret123", result.Credentials[2].Value)
	}
	if !result.Credentials[2].Secret {
		t.Error("password should be secret")
	}
}

func TestResolveURL(t *testing.T) {
	clients := &ClientsDef{
		Type: "url",
		URLs: []URLDef{
			{
				Name:   "Hysteria 2",
				Scheme: "hysteria2://{{settings.password}}@{{node.public_ip}}:{{settings.port}}/?insecure=1#{{node.hostname}}",
				QR:     true,
			},
		},
	}

	app := AppContext{
		Settings: map[string]interface{}{
			"password": "mypass123",
			"port":     443,
		},
	}
	node := NodeContext{
		PublicIP: "203.0.113.10",
		Hostname: "tokyo-1",
	}

	result, err := Resolve(clients, app, node)
	if err != nil {
		t.Fatalf("Resolve() error: %v", err)
	}

	if result.Type != "url" {
		t.Errorf("Type = %q, want url", result.Type)
	}
	if len(result.URLs) != 1 {
		t.Fatalf("URLs count = %d, want 1", len(result.URLs))
	}

	expected := "hysteria2://mypass123@203.0.113.10:443/?insecure=1#tokyo-1"
	if result.URLs[0].URI != expected {
		t.Errorf("URL = %q, want %q", result.URLs[0].URI, expected)
	}
	if !result.URLs[0].QR {
		t.Error("QR should be true")
	}
}

func TestResolveNilClients(t *testing.T) {
	_, err := Resolve(nil, AppContext{}, NodeContext{})
	if err == nil {
		t.Error("expected error for nil clients")
	}
}

func TestResolveUnknownType(t *testing.T) {
	_, err := Resolve(&ClientsDef{Type: "invalid"}, AppContext{}, NodeContext{})
	if err == nil {
		t.Error("expected error for unknown type")
	}
}

func TestContainerPathToHost(t *testing.T) {
	tests := []struct {
		containerPath string
		appDir        string
		expected      string
	}{
		{
			"/config/wg_confs/peer1.conf",
			"/data/apps/wg-abc",
			"/data/apps/wg-abc/configs/wg_confs/peer1.conf",
		},
		{
			"/etc/hysteria/config.yaml",
			"/data/apps/hy-def",
			"/data/apps/hy-def/configs/hysteria/config.yaml",
		},
	}

	for _, tt := range tests {
		result := containerPathToHost(tt.containerPath, tt.appDir)
		if result != tt.expected {
			t.Errorf("containerPathToHost(%q, %q) = %q, want %q",
				tt.containerPath, tt.appDir, result, tt.expected)
		}
	}
}

func TestRenderString(t *testing.T) {
	data := map[string]string{
		"node_public_ip": "1.2.3.4",
		"settings_port":  "443",
		"settings_user":  "admin",
	}

	tests := []struct {
		input    string
		expected string
	}{
		{"{{node.public_ip}}", "1.2.3.4"},
		{"{{settings.port}}", "443"},
		{"http://{{node.public_ip}}:{{settings.port}}", "http://1.2.3.4:443"},
		{"plain text", "plain text"},
	}

	for _, tt := range tests {
		result, err := renderString(tt.input, data)
		if err != nil {
			t.Errorf("renderString(%q) error: %v", tt.input, err)
			continue
		}
		if result != tt.expected {
			t.Errorf("renderString(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestListFileIndices(t *testing.T) {
	tmpDir := t.TempDir()
	appDir := filepath.Join(tmpDir, "app")
	confDir := filepath.Join(appDir, "configs", "wg_confs")
	os.MkdirAll(confDir, 0o755)

	// Create peer1 and peer2
	os.WriteFile(filepath.Join(confDir, "peer1.conf"), []byte("conf1"), 0o644)
	os.WriteFile(filepath.Join(confDir, "peer2.conf"), []byte("conf2"), 0o644)

	indices := ListFileIndices("/config/wg_confs/peer{n}.conf", appDir)
	if len(indices) != 2 {
		t.Fatalf("indices count = %d, want 2", len(indices))
	}
	if indices[0] != 1 || indices[1] != 2 {
		t.Errorf("indices = %v, want [1, 2]", indices)
	}
}

func TestReadFileByIndex(t *testing.T) {
	tmpDir := t.TempDir()
	appDir := filepath.Join(tmpDir, "app")
	confDir := filepath.Join(appDir, "configs", "wg_confs")
	os.MkdirAll(confDir, 0o755)

	os.WriteFile(filepath.Join(confDir, "peer1.conf"), []byte("test-content"), 0o644)

	name, content, err := ReadFileByIndex("/config/wg_confs/peer{n}.conf", appDir, 1)
	if err != nil {
		t.Fatalf("ReadFileByIndex() error: %v", err)
	}
	if name != "peer1.conf" {
		t.Errorf("name = %q, want peer1.conf", name)
	}
	if content != "test-content" {
		t.Errorf("content = %q, want test-content", content)
	}

	// Non-existent index
	_, _, err = ReadFileByIndex("/config/wg_confs/peer{n}.conf", appDir, 99)
	if err == nil {
		t.Error("expected error for non-existent index")
	}
}
