package update

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestEncodeDecodeSwitchConfig(t *testing.T) {
	cfg := SwitchConfig{
		Image: "ghcr.io/passim/passim:v1.1.0",
		Env:   []string{"PORT=8443", "SSL_MODE=off"},
		Binds: []string{"/var/run/docker.sock:/var/run/docker.sock", "passim-data:/data"},
		PortBindings: map[string]string{
			"8443/tcp": "8443",
			"80/tcp":   "80",
		},
		Labels:        map[string]string{"app": "passim"},
		CapAdd:        []string{"NET_ADMIN"},
		RestartPolicy: "unless-stopped",
	}

	encoded := encodeForTest(t, cfg)
	decoded, err := DecodeSwitchConfig(encoded)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if decoded.Image != cfg.Image {
		t.Errorf("image: got %q, want %q", decoded.Image, cfg.Image)
	}
	if len(decoded.Env) != len(cfg.Env) {
		t.Errorf("env: got %d items, want %d", len(decoded.Env), len(cfg.Env))
	}
	if len(decoded.Binds) != len(cfg.Binds) {
		t.Errorf("binds: got %d items, want %d", len(decoded.Binds), len(cfg.Binds))
	}
	if len(decoded.PortBindings) != len(cfg.PortBindings) {
		t.Errorf("ports: got %d items, want %d", len(decoded.PortBindings), len(cfg.PortBindings))
	}
	if decoded.RestartPolicy != cfg.RestartPolicy {
		t.Errorf("restart: got %q, want %q", decoded.RestartPolicy, cfg.RestartPolicy)
	}
}

func TestDecodeSwitchConfig_InvalidBase64(t *testing.T) {
	_, err := DecodeSwitchConfig("not-valid-base64!!!")
	if err == nil {
		t.Error("expected error for invalid base64")
	}
}

func TestDecodeSwitchConfig_InvalidJSON(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("{invalid"))
	_, err := DecodeSwitchConfig(encoded)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func encodeForTest(t *testing.T, cfg SwitchConfig) string {
	t.Helper()
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return base64.StdEncoding.EncodeToString(data)
}
