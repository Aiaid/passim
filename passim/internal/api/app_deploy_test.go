package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

// templateDir returns the absolute path to the templates directory.
func templateDir(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	dir := filepath.Join(filepath.Dir(thisFile), "..", "..", "templates")
	abs, err := filepath.Abs(dir)
	if err != nil {
		t.Fatal(err)
	}
	return abs
}

// setupDeployTest loads all real templates and creates a test server.
func setupDeployTest(t *testing.T) (http.Handler, string, *docker.MockClient, string) {
	t.Helper()

	reg := template.NewRegistry()
	if err := reg.LoadDir(templateDir(t)); err != nil {
		t.Fatal(err)
	}

	mock := &docker.MockClient{
		PullReader: io.NopCloser(strings.NewReader("")),
		CreateID:   "mock-ctr-001",
	}
	dataDir := t.TempDir()

	router, _, apiKey := testServerFullWithDataDir(t, mock, reg, dataDir)
	token := getToken(t, router, apiKey)
	return router, token, mock, dataDir
}

// deployTemplate sends a POST /api/apps request and returns the response code and body.
func deployTemplate(t *testing.T, router http.Handler, token, tmplName string, settings map[string]interface{}) (int, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]interface{}{
		"template": tmplName,
		"settings": settings,
	})
	req := httptest.NewRequest("POST", "/api/apps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w.Code, w.Body.String()
}

// findCreateCall finds the CreateAndStartContainer call in mock.Calls and returns the ContainerConfig.
func findCreateCall(t *testing.T, mock *docker.MockClient) *docker.ContainerConfig {
	t.Helper()
	for _, call := range mock.Calls {
		if call.Method == "CreateAndStartContainer" {
			return call.Args[0].(*docker.ContainerConfig)
		}
	}
	t.Fatal("CreateAndStartContainer not called")
	return nil
}

// containsEnv checks whether envSlice contains key=value.
func containsEnv(envSlice []string, key, value string) bool {
	target := key + "=" + value
	for _, e := range envSlice {
		if e == target {
			return true
		}
	}
	return false
}

// containsEnvKey checks whether envSlice contains key=<anything>.
func containsEnvKey(envSlice []string, key string) bool {
	prefix := key + "="
	for _, e := range envSlice {
		if strings.HasPrefix(e, prefix) {
			return true
		}
	}
	return false
}

// containsString checks whether a slice contains a string.
func containsString(ss []string, target string) bool {
	for _, s := range ss {
		if s == target {
			return true
		}
	}
	return false
}

func TestDeployApp_Wireguard(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "wireguard", map[string]interface{}{
		"peers": 3,
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports
	if !containsString(cfg.Ports, "51820:51820/udp") {
		t.Errorf("ports = %v, want 51820:51820/udp", cfg.Ports)
	}

	// Verify cap_add
	if !containsString(cfg.CapAdd, "NET_ADMIN") {
		t.Errorf("cap_add missing NET_ADMIN: %v", cfg.CapAdd)
	}
	if !containsString(cfg.CapAdd, "SYS_MODULE") {
		t.Errorf("cap_add missing SYS_MODULE: %v", cfg.CapAdd)
	}

	// Verify sysctls
	if cfg.Sysctls == nil {
		t.Fatal("Sysctls is nil")
	}
	if v, ok := cfg.Sysctls["net.ipv4.conf.all.src_valid_mark"]; !ok || v != "1" {
		t.Errorf("sysctls = %v, want net.ipv4.conf.all.src_valid_mark=1", cfg.Sysctls)
	}

	// Verify env
	if !containsEnv(cfg.Env, "PEERS", "3") {
		t.Errorf("env missing PEERS=3: %v", cfg.Env)
	}

	// Verify image
	if cfg.Image != "linuxserver/wireguard" {
		t.Errorf("image = %q, want linuxserver/wireguard", cfg.Image)
	}
}

func TestDeployApp_L2TP(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "l2tp", map[string]interface{}{
		"vpn_user":     "testuser",
		"vpn_password": "testpass",
		"vpn_psk":      "testpsk",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports
	if !containsString(cfg.Ports, "500:500/udp") {
		t.Errorf("ports missing 500:500/udp: %v", cfg.Ports)
	}
	if !containsString(cfg.Ports, "4500:4500/udp") {
		t.Errorf("ports missing 4500:4500/udp: %v", cfg.Ports)
	}

	// Verify cap_add
	if !containsString(cfg.CapAdd, "NET_ADMIN") {
		t.Errorf("cap_add missing NET_ADMIN: %v", cfg.CapAdd)
	}

	// Verify env
	if !containsEnv(cfg.Env, "VPN_USER", "testuser") {
		t.Errorf("env missing VPN_USER=testuser: %v", cfg.Env)
	}
	if !containsEnv(cfg.Env, "VPN_PASSWORD", "testpass") {
		t.Errorf("env missing VPN_PASSWORD=testpass: %v", cfg.Env)
	}
	if !containsEnv(cfg.Env, "VPN_IPSEC_PSK", "testpsk") {
		t.Errorf("env missing VPN_IPSEC_PSK=testpsk: %v", cfg.Env)
	}

	// Verify image
	if cfg.Image != "hwdsl2/ipsec-vpn-server" {
		t.Errorf("image = %q, want hwdsl2/ipsec-vpn-server", cfg.Image)
	}
}

func TestDeployApp_Hysteria(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "hysteria", map[string]interface{}{
		"port":     443,
		"password": "testpw",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports — template is "{{settings.port}}:443/udp" → "443:443/udp"
	if !containsString(cfg.Ports, "443:443/udp") {
		t.Errorf("ports = %v, want 443:443/udp", cfg.Ports)
	}

	// Verify cmd
	expected := []string{"server", "-c", "/etc/hysteria/config.yaml"}
	if len(cfg.Cmd) != len(expected) {
		t.Fatalf("Cmd length = %d, want %d: %v", len(cfg.Cmd), len(expected), cfg.Cmd)
	}
	for i, v := range expected {
		if cfg.Cmd[i] != v {
			t.Errorf("Cmd[%d] = %q, want %q", i, cfg.Cmd[i], v)
		}
	}

	// Verify image
	if cfg.Image != "tobyxdd/hysteria" {
		t.Errorf("image = %q, want tobyxdd/hysteria", cfg.Image)
	}
}

func TestDeployApp_V2Ray(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "v2ray", map[string]interface{}{
		"port": 10086,
		"uuid": "test-uuid-value",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports — "{{settings.port}}:10086" → "10086:10086"
	if !containsString(cfg.Ports, "10086:10086") {
		t.Errorf("ports = %v, want 10086:10086", cfg.Ports)
	}

	// Verify cmd
	expected := []string{"run", "-c", "/etc/v2ray/config.json"}
	if len(cfg.Cmd) != len(expected) {
		t.Fatalf("Cmd length = %d, want %d: %v", len(cfg.Cmd), len(expected), cfg.Cmd)
	}
	for i, v := range expected {
		if cfg.Cmd[i] != v {
			t.Errorf("Cmd[%d] = %q, want %q", i, cfg.Cmd[i], v)
		}
	}

	// Verify image
	if cfg.Image != "v2fly/v2fly-core" {
		t.Errorf("image = %q, want v2fly/v2fly-core", cfg.Image)
	}
}

func TestDeployApp_WebDAV(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "webdav", map[string]interface{}{
		"username": "admin",
		"password": "testpw",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports
	if !containsString(cfg.Ports, "8080:80") {
		t.Errorf("ports = %v, want 8080:80", cfg.Ports)
	}

	// Verify env
	if !containsEnv(cfg.Env, "USERNAME", "admin") {
		t.Errorf("env missing USERNAME=admin: %v", cfg.Env)
	}
	if !containsEnv(cfg.Env, "PASSWORD", "testpw") {
		t.Errorf("env missing PASSWORD=testpw: %v", cfg.Env)
	}

	// Verify image
	if cfg.Image != "bytemark/webdav" {
		t.Errorf("image = %q, want bytemark/webdav", cfg.Image)
	}
}

func TestDeployApp_Samba(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "samba", map[string]interface{}{
		"username":   "user",
		"password":   "testpw",
		"share_name": "share",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports
	if !containsString(cfg.Ports, "139:139") {
		t.Errorf("ports missing 139:139: %v", cfg.Ports)
	}
	if !containsString(cfg.Ports, "445:445") {
		t.Errorf("ports missing 445:445: %v", cfg.Ports)
	}

	// Verify cmd contains -u and -s flags
	hasU := false
	hasS := false
	for _, arg := range cfg.Cmd {
		if arg == "-u" {
			hasU = true
		}
		if arg == "-s" {
			hasS = true
		}
	}
	if !hasU {
		t.Errorf("Cmd missing -u flag: %v", cfg.Cmd)
	}
	if !hasS {
		t.Errorf("Cmd missing -s flag: %v", cfg.Cmd)
	}

	// Verify the user argument contains the username and password
	for i, arg := range cfg.Cmd {
		if arg == "-u" && i+1 < len(cfg.Cmd) {
			if !strings.Contains(cfg.Cmd[i+1], "user") || !strings.Contains(cfg.Cmd[i+1], "testpw") {
				t.Errorf("user arg = %q, want to contain user and testpw", cfg.Cmd[i+1])
			}
		}
	}

	// Verify image
	if cfg.Image != "dperson/samba" {
		t.Errorf("image = %q, want dperson/samba", cfg.Image)
	}
}

func TestDeployApp_RDesktop(t *testing.T) {
	router, token, mock, _ := setupDeployTest(t)

	code, body := deployTemplate(t, router, token, "rdesktop", map[string]interface{}{
		"resolution": "1920x1080",
	})
	if code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", code, body)
	}

	cfg := findCreateCall(t, mock)

	// Verify ports
	if !containsString(cfg.Ports, "3389:3389") {
		t.Errorf("ports = %v, want 3389:3389", cfg.Ports)
	}

	// Verify env — CUSTOM_RES should be set to the resolution
	if !containsEnv(cfg.Env, "CUSTOM_RES", "1920x1080") {
		t.Errorf("env missing CUSTOM_RES=1920x1080: %v", cfg.Env)
	}

	// Verify image
	if cfg.Image != "linuxserver/rdesktop" {
		t.Errorf("image = %q, want linuxserver/rdesktop", cfg.Image)
	}
}
