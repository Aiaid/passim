package ssl

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSSLManager_SelfSigned_Init(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("self-signed", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	// cert and key should have been created
	certPath := filepath.Join(dir, "certs", "cert.pem")
	keyPath := filepath.Join(dir, "certs", "key.pem")
	if _, err := os.Stat(certPath); err != nil {
		t.Errorf("cert not created: %v", err)
	}
	if _, err := os.Stat(keyPath); err != nil {
		t.Errorf("key not created: %v", err)
	}
}

func TestSSLManager_SelfSigned_InitIdempotent(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("self-signed", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("first Init() error: %v", err)
	}

	// Get modification time of cert
	certPath := filepath.Join(dir, "certs", "cert.pem")
	info1, _ := os.Stat(certPath)

	// Init again — should reuse existing cert
	mgr2 := NewSSLManager("self-signed", dir)
	if err := mgr2.Init(); err != nil {
		t.Fatalf("second Init() error: %v", err)
	}

	info2, _ := os.Stat(certPath)
	if info1.ModTime() != info2.ModTime() {
		t.Error("Init() regenerated cert instead of reusing existing one")
	}
}

func TestSSLManager_SelfSigned_Status(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("self-signed", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	status := mgr.Status()
	if status.Mode != "self-signed" {
		t.Errorf("Mode = %q, want %q", status.Mode, "self-signed")
	}
	if !status.Valid {
		t.Error("Status.Valid = false, want true")
	}
	if status.ExpiresAt == "" {
		t.Error("Status.ExpiresAt is empty")
	}
	if status.Issuer != "passim" {
		t.Errorf("Status.Issuer = %q, want %q", status.Issuer, "passim")
	}
	if status.Domain != "localhost" {
		t.Errorf("Status.Domain = %q, want %q", status.Domain, "localhost")
	}
}

func TestSSLManager_SelfSigned_GetTLSConfig(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("self-signed", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	tlsConfig, err := mgr.GetTLSConfig()
	if err != nil {
		t.Fatalf("GetTLSConfig() error: %v", err)
	}
	if tlsConfig == nil {
		t.Fatal("GetTLSConfig() returned nil")
	}
	if len(tlsConfig.Certificates) != 1 {
		t.Errorf("got %d certificates, want 1", len(tlsConfig.Certificates))
	}
	if tlsConfig.MinVersion != 0x0303 { // tls.VersionTLS12
		t.Errorf("MinVersion = %x, want TLS 1.2 (0x0303)", tlsConfig.MinVersion)
	}
}

func TestSSLManager_Auto_Stub(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("auto", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	status := mgr.Status()
	if status.Mode != "auto" {
		t.Errorf("Mode = %q, want %q", status.Mode, "auto")
	}

	_, err := mgr.GetTLSConfig()
	if err == nil {
		t.Error("GetTLSConfig() for auto mode should return error")
	}
}

func TestSSLManager_Custom_Missing(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager("custom", dir)
	err := mgr.Init()
	if err == nil {
		t.Error("Init() should fail when custom cert files are missing")
	}
}

func TestSSLManager_Custom_Exists(t *testing.T) {
	dir := t.TempDir()

	// Generate self-signed cert to act as a custom cert
	certDir := filepath.Join(dir, "certs")
	_, _, err := GenerateSelfSigned(certDir)
	if err != nil {
		t.Fatalf("generate test cert: %v", err)
	}

	mgr := NewSSLManager("custom", dir)
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	status := mgr.Status()
	if !status.Valid {
		t.Error("custom cert should be valid")
	}
}

func TestSSLManager_UnknownMode(t *testing.T) {
	mgr := NewSSLManager("invalid", t.TempDir())
	if err := mgr.Init(); err == nil {
		t.Error("Init() should fail for unknown mode")
	}
}

func TestSSLManager_StatusBeforeInit(t *testing.T) {
	mgr := NewSSLManager("self-signed", t.TempDir())
	status := mgr.Status()
	if status.Valid {
		t.Error("Status should not be valid before Init()")
	}
}
