package docker

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeploy_Success(t *testing.T) {
	mock := &MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-abc123",
	}

	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "wireguard",
		Image:   "linuxserver/wireguard",
		Env:     map[string]string{"PEERS": "3"},
		Ports:   []string{"51820:51820/udp"},
		Volumes: []string{"/data/configs/wireguard:/config"},
		Labels:  map[string]string{"io.passim": "vpn"},
		CapAdd:  []string{"NET_ADMIN"},
		ConfigFiles: []DeployConfigFile{
			{Path: "wg0.conf", Content: "[Interface]\nAddress = 10.0.0.1/24"},
		},
		DataDir: dataDir,
	}

	result, err := Deploy(context.Background(), mock, req)
	if err != nil {
		t.Fatalf("Deploy() error: %v", err)
	}
	if result.ContainerID != "container-abc123" {
		t.Errorf("ContainerID = %q, want container-abc123", result.ContainerID)
	}

	// Verify PullImage was called
	hasPull := false
	hasCreate := false
	for _, call := range mock.Calls {
		if call.Method == "PullImage" {
			hasPull = true
			if call.Args[0] != "linuxserver/wireguard" {
				t.Errorf("PullImage arg = %v, want linuxserver/wireguard", call.Args[0])
			}
		}
		if call.Method == "CreateAndStartContainer" {
			hasCreate = true
			cfg := call.Args[0].(*ContainerConfig)
			if cfg.Image != "linuxserver/wireguard" {
				t.Errorf("Image = %q", cfg.Image)
			}
			if cfg.Labels["io.passim.managed"] != "true" {
				t.Error("missing io.passim.managed label")
			}
			if cfg.Labels["io.passim.app.id"] != req.AppID {
				t.Errorf("app id label = %q", cfg.Labels["io.passim.app.id"])
			}
		}
	}
	if !hasPull {
		t.Error("PullImage not called")
	}
	if !hasCreate {
		t.Error("CreateAndStartContainer not called")
	}

	// Verify config file written
	configPath := filepath.Join(dataDir, "apps", "wireguard-11111111", "configs", "wg0.conf")
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("config file not written: %v", err)
	}
	if !strings.Contains(string(data), "10.0.0.1/24") {
		t.Errorf("config content = %q", string(data))
	}
}

func TestDeploy_NilClient(t *testing.T) {
	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "test",
		Image:   "test:latest",
		DataDir: t.TempDir(),
	}
	_, err := Deploy(context.Background(), nil, req)
	if err == nil {
		t.Fatal("expected error for nil client")
	}
}

func TestDeploy_PullFails(t *testing.T) {
	mock := &MockClient{
		PullErr: io.ErrUnexpectedEOF,
	}
	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "test",
		Image:   "bad:image",
		DataDir: t.TempDir(),
	}
	_, err := Deploy(context.Background(), mock, req)
	if err == nil {
		t.Fatal("expected error when pull fails")
	}
}

func TestUndeploy(t *testing.T) {
	mock := &MockClient{}

	dataDir := t.TempDir()
	configDir := filepath.Join(dataDir, "apps", "wireguard-11111111", "configs")
	os.MkdirAll(configDir, 0755)
	os.WriteFile(filepath.Join(configDir, "test.conf"), []byte("content"), 0644)

	err := Undeploy(context.Background(), mock, "container-123", "wireguard", "11111111-2222-3333-4444-555555555555", dataDir)
	if err != nil {
		t.Fatalf("Undeploy() error: %v", err)
	}

	// Verify stop + remove called
	hasStop := false
	hasRemove := false
	for _, call := range mock.Calls {
		if call.Method == "StopContainer" {
			hasStop = true
		}
		if call.Method == "RemoveContainer" {
			hasRemove = true
		}
	}
	if !hasStop {
		t.Error("StopContainer not called")
	}
	if !hasRemove {
		t.Error("RemoveContainer not called")
	}

	// Verify config cleaned up
	if _, err := os.Stat(configDir); !os.IsNotExist(err) {
		t.Error("config dir should be removed")
	}
}

func TestDeploy_WithArgs(t *testing.T) {
	mock := &MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-args-001",
	}

	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "testapp",
		Image:   "test/image:latest",
		Args:    []string{"server", "-c", "/etc/app/config.yaml"},
		DataDir: t.TempDir(),
	}

	result, err := Deploy(context.Background(), mock, req)
	if err != nil {
		t.Fatalf("Deploy() error: %v", err)
	}
	if result.ContainerID != "container-args-001" {
		t.Errorf("ContainerID = %q", result.ContainerID)
	}

	found := false
	for _, call := range mock.Calls {
		if call.Method == "CreateAndStartContainer" {
			found = true
			cfg := call.Args[0].(*ContainerConfig)
			if len(cfg.Cmd) != 3 {
				t.Fatalf("Cmd length = %d, want 3", len(cfg.Cmd))
			}
			if cfg.Cmd[0] != "server" || cfg.Cmd[1] != "-c" || cfg.Cmd[2] != "/etc/app/config.yaml" {
				t.Errorf("Cmd = %v, want [server -c /etc/app/config.yaml]", cfg.Cmd)
			}
		}
	}
	if !found {
		t.Error("CreateAndStartContainer not called")
	}
}

func TestDeploy_WithSysctls(t *testing.T) {
	mock := &MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-sysctl-001",
	}

	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "testapp",
		Image:   "test/image:latest",
		Sysctls: map[string]string{"net.ipv4.conf.all.src_valid_mark": "1"},
		DataDir: t.TempDir(),
	}

	_, err := Deploy(context.Background(), mock, req)
	if err != nil {
		t.Fatalf("Deploy() error: %v", err)
	}

	found := false
	for _, call := range mock.Calls {
		if call.Method == "CreateAndStartContainer" {
			found = true
			cfg := call.Args[0].(*ContainerConfig)
			if cfg.Sysctls == nil {
				t.Fatal("Sysctls is nil")
			}
			v, ok := cfg.Sysctls["net.ipv4.conf.all.src_valid_mark"]
			if !ok {
				t.Error("missing sysctl net.ipv4.conf.all.src_valid_mark")
			}
			if v != "1" {
				t.Errorf("sysctl value = %q, want %q", v, "1")
			}
		}
	}
	if !found {
		t.Error("CreateAndStartContainer not called")
	}
}

func TestDeploy_RestartPolicyApplied(t *testing.T) {
	mock := &MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "container-restart-001",
	}

	req := &DeployRequest{
		AppID:   "11111111-2222-3333-4444-555555555555",
		AppName: "testapp",
		Image:   "test/image:latest",
		DataDir: t.TempDir(),
	}

	_, err := Deploy(context.Background(), mock, req)
	if err != nil {
		t.Fatalf("Deploy() error: %v", err)
	}

	found := false
	for _, call := range mock.Calls {
		if call.Method == "CreateAndStartContainer" {
			found = true
			cfg := call.Args[0].(*ContainerConfig)
			if cfg.RestartPolicy != "unless-stopped" {
				t.Errorf("RestartPolicy = %q, want %q", cfg.RestartPolicy, "unless-stopped")
			}
		}
	}
	if !found {
		t.Error("CreateAndStartContainer not called")
	}
}

func TestWriteConfigFiles(t *testing.T) {
	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		AppName: "testapp",
		DataDir: dataDir,
		ConfigFiles: []DeployConfigFile{
			{Path: "config.yml", Content: "key: value"},
			{Path: "subdir/nested.conf", Content: "nested content"},
		},
	}

	err := writeConfigFiles(req)
	if err != nil {
		t.Fatalf("writeConfigFiles() error: %v", err)
	}

	base := filepath.Join(dataDir, "apps", "testapp-aaaaaaaa", "configs")

	data, err := os.ReadFile(filepath.Join(base, "config.yml"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "key: value" {
		t.Errorf("content = %q", string(data))
	}

	data, err = os.ReadFile(filepath.Join(base, "subdir", "nested.conf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "nested content" {
		t.Errorf("content = %q", string(data))
	}
}
