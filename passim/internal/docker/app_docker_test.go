//go:build dockertest

package docker

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// waitForContainer polls docker inspect until the container is running or timeout.
func waitForContainer(ctx context.Context, client DockerClient, id string, timeout time.Duration) error {
	deadline := time.After(timeout)
	for {
		select {
		case <-deadline:
			return fmt.Errorf("timeout waiting for container %s to start", id)
		default:
			info, err := client.InspectContainer(ctx, id)
			if err == nil && info.State != nil && info.State.Running {
				return nil
			}
			time.Sleep(500 * time.Millisecond)
		}
	}
}

// waitForPort polls a TCP port until it accepts connections or timeout.
func waitForPort(host string, port string, timeout time.Duration) error {
	deadline := time.After(timeout)
	for {
		select {
		case <-deadline:
			return fmt.Errorf("timeout waiting for %s:%s", host, port)
		default:
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 2*time.Second)
			if err == nil {
				conn.Close()
				return nil
			}
			time.Sleep(1 * time.Second)
		}
	}
}

// deployAndCleanup is a helper that deploys an app and registers cleanup.
func deployAndCleanup(t *testing.T, client DockerClient, req *DeployRequest) *DeployResult {
	t.Helper()
	ctx := context.Background()

	result, err := Deploy(ctx, client, req)
	if err != nil {
		t.Fatalf("Deploy failed: %v", err)
	}

	t.Cleanup(func() {
		_ = client.StopContainer(context.Background(), result.ContainerID)
		_ = client.RemoveContainer(context.Background(), result.ContainerID)
		// Clean up config dir
		if req.DataDir != "" {
			configDir := filepath.Join(req.DataDir, "apps", req.AppName+"-"+req.AppID[:8])
			os.RemoveAll(configDir)
		}
	})

	return result
}

func TestDockerApp_WebDAV(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "aaaaaaaa-1111-2222-3333-444444444444",
		AppName: "webdav",
		Image:   "bytemark/webdav",
		Env:     map[string]string{"AUTH_TYPE": "Digest", "USERNAME": "testuser", "PASSWORD": "testpass"},
		Ports:   []string{"18080:80"},
		Volumes: []string{filepath.Join(dataDir, "files/webdav") + ":/var/lib/dav"},
		Labels:  map[string]string{},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 60*time.Second); err != nil {
		t.Fatal(err)
	}

	if err := waitForPort("127.0.0.1", "18080", 30*time.Second); err != nil {
		t.Fatal(err)
	}

	// Check container logs for startup errors
	logs, err := client.ContainerLogs(ctx, result.ContainerID, 50)
	if err != nil {
		t.Logf("Warning: could not read logs: %v", err)
	} else {
		data, _ := io.ReadAll(logs)
		logs.Close()
		logStr := string(data)
		if strings.Contains(strings.ToLower(logStr), "fatal") || strings.Contains(strings.ToLower(logStr), "panic") {
			t.Errorf("Container logs contain errors:\n%s", logStr)
		}
	}
}

func TestDockerApp_Samba(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "bbbbbbbb-1111-2222-3333-444444444444",
		AppName: "samba",
		Image:   "dperson/samba",
		Env:     map[string]string{},
		Ports:   []string{"10139:139", "10445:445"},
		Volumes: []string{filepath.Join(dataDir, "files/samba") + ":/mount"},
		Labels:  map[string]string{},
		Args:    []string{"-u", "testuser;testpass", "-s", "share;/mount;yes;no;no;testuser"},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 60*time.Second); err != nil {
		t.Fatal(err)
	}

	if err := waitForPort("127.0.0.1", "10445", 30*time.Second); err != nil {
		t.Fatal(err)
	}
}

func TestDockerApp_V2Ray(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()

	// Write config file
	configDir := filepath.Join(dataDir, "configs", "v2ray")
	os.MkdirAll(configDir, 0755)
	configContent := `{
  "inbounds": [{"port": 10086, "protocol": "vmess", "settings": {"clients": [{"id": "test-uuid-1234", "alterId": 0}]}}],
  "outbounds": [{"protocol": "freedom", "settings": {}}]
}`
	os.WriteFile(filepath.Join(configDir, "config.json"), []byte(configContent), 0644)

	req := &DeployRequest{
		AppID:   "cccccccc-1111-2222-3333-444444444444",
		AppName: "v2ray",
		Image:   "v2fly/v2fly-core",
		Env:     map[string]string{},
		Ports:   []string{"20086:10086"},
		Volumes: []string{configDir + ":/etc/v2ray"},
		Labels:  map[string]string{},
		Args:    []string{"run", "-c", "/etc/v2ray/config.json"},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 90*time.Second); err != nil {
		t.Fatal(err)
	}

	if err := waitForPort("127.0.0.1", "20086", 30*time.Second); err != nil {
		t.Fatal(err)
	}

	logs, err := client.ContainerLogs(ctx, result.ContainerID, 20)
	if err == nil {
		data, _ := io.ReadAll(logs)
		logs.Close()
		t.Logf("V2Ray logs:\n%s", string(data))
	}
}

func TestDockerApp_Hysteria(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()

	// Write hysteria config
	configDir := filepath.Join(dataDir, "configs", "hysteria")
	os.MkdirAll(configDir, 0755)
	configContent := `listen: :443
auth:
  type: password
  password: testpassword
masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
`
	os.WriteFile(filepath.Join(configDir, "config.yaml"), []byte(configContent), 0644)

	req := &DeployRequest{
		AppID:   "dddddddd-1111-2222-3333-444444444444",
		AppName: "hysteria",
		Image:   "tobyxdd/hysteria",
		Env:     map[string]string{},
		Ports:   []string{"20443:443/udp"},
		Volumes: []string{configDir + ":/etc/hysteria"},
		Labels:  map[string]string{},
		Args:    []string{"server", "-c", "/etc/hysteria/config.yaml"},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 90*time.Second); err != nil {
		t.Fatal(err)
	}

	// Hysteria uses UDP, so we check logs instead of TCP port
	time.Sleep(3 * time.Second)
	logs, err := client.ContainerLogs(ctx, result.ContainerID, 50)
	if err != nil {
		t.Logf("Warning: could not read logs: %v", err)
		return
	}
	data, _ := io.ReadAll(logs)
	logs.Close()
	logStr := string(data)
	t.Logf("Hysteria logs:\n%s", logStr)

	if strings.Contains(strings.ToLower(logStr), "fatal") {
		t.Errorf("Hysteria container has fatal errors in logs")
	}
}

func TestDockerApp_RDesktop(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "eeeeeeee-1111-2222-3333-444444444444",
		AppName: "rdesktop",
		Image:   "linuxserver/rdesktop",
		Env:     map[string]string{"PUID": "1000", "PGID": "1000", "CUSTOM_RES": "1920x1080"},
		Ports:   []string{"13389:3389"},
		Volumes: []string{filepath.Join(dataDir, "configs/rdesktop") + ":/config"},
		Labels:  map[string]string{},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 120*time.Second); err != nil {
		t.Fatal(err)
	}

	if err := waitForPort("127.0.0.1", "13389", 60*time.Second); err != nil {
		t.Fatal(err)
	}
}

func TestDockerApp_Wireguard(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()
	configDir := filepath.Join(dataDir, "configs", "wireguard")
	os.MkdirAll(configDir, 0755)

	req := &DeployRequest{
		AppID:   "ffffffff-1111-2222-3333-444444444444",
		AppName: "wireguard",
		Image:   "linuxserver/wireguard",
		Env:     map[string]string{"PEERS": "1", "PUID": "1000", "PGID": "1000"},
		Ports:   []string{"51820:51820/udp"},
		Volumes: []string{configDir + ":/config"},
		Labels:  map[string]string{},
		CapAdd:  []string{"NET_ADMIN", "SYS_MODULE"},
		Sysctls: map[string]string{"net.ipv4.conf.all.src_valid_mark": "1"},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 120*time.Second); err != nil {
		t.Fatal(err)
	}

	// Give WireGuard time to generate peer configs
	time.Sleep(5 * time.Second)

	logs, err := client.ContainerLogs(ctx, result.ContainerID, 50)
	if err == nil {
		data, _ := io.ReadAll(logs)
		logs.Close()
		t.Logf("WireGuard logs:\n%s", string(data))
	}
}

func TestDockerApp_L2TP(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx); err != nil {
		t.Skipf("Docker daemon not responding: %v", err)
	}

	dataDir := t.TempDir()
	req := &DeployRequest{
		AppID:   "11111111-aaaa-bbbb-cccc-dddddddddddd",
		AppName: "l2tp",
		Image:   "hwdsl2/ipsec-vpn-server",
		Env:     map[string]string{"VPN_IPSEC_PSK": "testpsk", "VPN_USER": "testuser", "VPN_PASSWORD": "testpass"},
		Ports:   []string{"10500:500/udp", "14500:4500/udp"},
		Volumes: []string{filepath.Join(dataDir, "configs/l2tp") + ":/etc/ipsec.d", "/lib/modules:/lib/modules:ro"},
		Labels:  map[string]string{},
		CapAdd:  []string{"NET_ADMIN"},
		DataDir: dataDir,
	}

	result := deployAndCleanup(t, client, req)

	if err := waitForContainer(ctx, client, result.ContainerID, 120*time.Second); err != nil {
		t.Fatal(err)
	}

	// L2TP uses UDP, check logs
	time.Sleep(5 * time.Second)
	logs, err := client.ContainerLogs(ctx, result.ContainerID, 50)
	if err == nil {
		data, _ := io.ReadAll(logs)
		logs.Close()
		t.Logf("L2TP logs:\n%s", string(data))
	}
}
