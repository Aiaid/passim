package template

import (
	"testing"
)

func TestRenderVariableSubstitution(t *testing.T) {
	tmpl := &Template{
		Name: "test",
		Container: ContainerSpec{
			Image: "myapp:latest",
			Ports: []string{"{{settings.port}}:8080/tcp"},
			Volumes: []string{"/data/{{settings.name}}:/app"},
			Environment: map[string]string{
				"PEERS":    "{{settings.peers}}",
				"TIMEZONE": "{{node.Timezone}}",
				"SECRET":   "{{generated.secret}}",
			},
			Labels: map[string]string{
				"app": "{{settings.name}}",
			},
			CapAdd: []string{"NET_ADMIN"},
			Sysctls: map[string]string{
				"net.ipv4.ip_forward": "1",
			},
			Args: []string{"--peers={{settings.peers}}"},
		},
	}

	data := RenderData{
		Settings: map[string]interface{}{
			"peers": 5,
			"port":  "51820",
			"name":  "wireguard",
		},
		Node: NodeInfo{
			PublicIP:  "203.0.113.1",
			Timezone:  "America/New_York",
			Hostname:  "server1",
		},
		Generated: map[string]string{
			"secret": "abc123",
		},
	}

	result, err := Render(tmpl, data)
	if err != nil {
		t.Fatalf("Render() error: %v", err)
	}

	// Environment
	if result.Environment["PEERS"] != "5" {
		t.Errorf("Environment[PEERS] = %q, want %q", result.Environment["PEERS"], "5")
	}
	if result.Environment["TIMEZONE"] != "America/New_York" {
		t.Errorf("Environment[TIMEZONE] = %q, want %q", result.Environment["TIMEZONE"], "America/New_York")
	}
	if result.Environment["SECRET"] != "abc123" {
		t.Errorf("Environment[SECRET] = %q, want %q", result.Environment["SECRET"], "abc123")
	}

	// Ports
	if len(result.Ports) != 1 || result.Ports[0] != "51820:8080/tcp" {
		t.Errorf("Ports = %v, want [51820:8080/tcp]", result.Ports)
	}

	// Volumes
	if len(result.Volumes) != 1 || result.Volumes[0] != "/data/wireguard:/app" {
		t.Errorf("Volumes = %v, want [/data/wireguard:/app]", result.Volumes)
	}

	// Labels
	if result.Labels["app"] != "wireguard" {
		t.Errorf("Labels[app] = %q, want %q", result.Labels["app"], "wireguard")
	}

	// Args
	if len(result.Args) != 1 || result.Args[0] != "--peers=5" {
		t.Errorf("Args = %v, want [--peers=5]", result.Args)
	}

	// CapAdd copied
	if len(result.CapAdd) != 1 || result.CapAdd[0] != "NET_ADMIN" {
		t.Errorf("CapAdd = %v", result.CapAdd)
	}

	// Sysctls passed through
	if result.Sysctls["net.ipv4.ip_forward"] != "1" {
		t.Errorf("Sysctls = %v", result.Sysctls)
	}

	// Image unchanged (no placeholders)
	if result.Image != "myapp:latest" {
		t.Errorf("Image = %q, want %q", result.Image, "myapp:latest")
	}
}

func TestRenderMissingVariable(t *testing.T) {
	tmpl := &Template{
		Name: "test",
		Container: ContainerSpec{
			Image: "alpine",
			Environment: map[string]string{
				"VAL": "{{settings.missing}}",
			},
		},
	}

	data := RenderData{
		Settings: map[string]interface{}{},
	}

	_, err := Render(tmpl, data)
	if err == nil {
		t.Error("Render() should have returned an error for missing variable")
	}
}

func TestRenderConfigFiles(t *testing.T) {
	tmpl := &Template{
		Name: "test",
		Container: ContainerSpec{
			Image: "alpine",
		},
		Config: &ConfigMapping{
			Files: []ConfigFile{
				{
					Path:     "/config/app.conf",
					Template: "server_ip = {{node.PublicIP}}\npeers = {{settings.peers}}",
				},
			},
		},
	}

	data := RenderData{
		Settings: map[string]interface{}{
			"peers": 3,
		},
		Node: NodeInfo{
			PublicIP: "10.0.0.1",
		},
	}

	result, err := Render(tmpl, data)
	if err != nil {
		t.Fatalf("Render() error: %v", err)
	}

	if len(result.ConfigFiles) != 1 {
		t.Fatalf("len(ConfigFiles) = %d, want 1", len(result.ConfigFiles))
	}
	cf := result.ConfigFiles[0]
	if cf.Path != "/config/app.conf" {
		t.Errorf("ConfigFile.Path = %q", cf.Path)
	}
	expected := "server_ip = 10.0.0.1\npeers = 3"
	if cf.Content != expected {
		t.Errorf("ConfigFile.Content = %q, want %q", cf.Content, expected)
	}
}

func TestRenderNoPlaceholders(t *testing.T) {
	tmpl := &Template{
		Name: "static",
		Container: ContainerSpec{
			Image: "nginx:latest",
			Ports: []string{"80:80"},
			Environment: map[string]string{
				"MODE": "production",
			},
		},
	}

	data := RenderData{
		Settings: map[string]interface{}{},
	}

	result, err := Render(tmpl, data)
	if err != nil {
		t.Fatalf("Render() error: %v", err)
	}

	if result.Image != "nginx:latest" {
		t.Errorf("Image = %q", result.Image)
	}
	if result.Environment["MODE"] != "production" {
		t.Errorf("Environment[MODE] = %q", result.Environment["MODE"])
	}
}

func TestRenderNodeVariables(t *testing.T) {
	tmpl := &Template{
		Name: "test",
		Container: ContainerSpec{
			Image: "alpine",
			Environment: map[string]string{
				"PUBLIC_IP": "{{node.PublicIP}}",
				"TZ":        "{{node.Timezone}}",
				"HOST":      "{{node.Hostname}}",
			},
		},
	}

	data := RenderData{
		Settings: map[string]interface{}{},
		Node: NodeInfo{
			PublicIP:  "192.168.1.1",
			Timezone:  "UTC",
			Hostname:  "myhost",
		},
	}

	result, err := Render(tmpl, data)
	if err != nil {
		t.Fatalf("Render() error: %v", err)
	}

	if result.Environment["PUBLIC_IP"] != "192.168.1.1" {
		t.Errorf("PUBLIC_IP = %q", result.Environment["PUBLIC_IP"])
	}
	if result.Environment["TZ"] != "UTC" {
		t.Errorf("TZ = %q", result.Environment["TZ"])
	}
	if result.Environment["HOST"] != "myhost" {
		t.Errorf("HOST = %q", result.Environment["HOST"])
	}
}
