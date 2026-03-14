package ssl

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSSLManager_SelfSigned_Init(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
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

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
	if err := mgr.Init(); err != nil {
		t.Fatalf("first Init() error: %v", err)
	}

	// Get modification time of cert
	certPath := filepath.Join(dir, "certs", "cert.pem")
	info1, _ := os.Stat(certPath)

	// Init again — should reuse existing cert
	mgr2 := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
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

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
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

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
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

func TestSSLManager_Auto_Init(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "auto", DataDir: dir, Domain: "example.com"})
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	status := mgr.Status()
	if status.Mode != "auto" {
		t.Errorf("Mode = %q, want %q", status.Mode, "auto")
	}
	if status.Domain != "example.com" {
		t.Errorf("Domain = %q, want %q", status.Domain, "example.com")
	}

	// After Init(), GetTLSConfig() should succeed (autocert is initialized)
	tlsCfg, err := mgr.GetTLSConfig()
	if err != nil {
		t.Fatalf("GetTLSConfig() error: %v", err)
	}
	if tlsCfg == nil {
		t.Fatal("GetTLSConfig() returned nil")
	}
	if tlsCfg.MinVersion != 0x0303 { // tls.VersionTLS12
		t.Errorf("MinVersion = %x, want TLS 1.2 (0x0303)", tlsCfg.MinVersion)
	}
}

func TestSSLManager_Auto_NoDomain(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "auto", DataDir: dir})
	err := mgr.Init()
	if err == nil {
		t.Error("Init() should fail when domain is not set for auto mode")
	}
}

func TestSSLManager_Custom_Missing(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "custom", DataDir: dir})
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

	mgr := NewSSLManager(SSLManagerConfig{Mode: "custom", DataDir: dir})
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	status := mgr.Status()
	if !status.Valid {
		t.Error("custom cert should be valid")
	}
}

func TestSSLManager_UnknownMode(t *testing.T) {
	mgr := NewSSLManager(SSLManagerConfig{Mode: "invalid", DataDir: t.TempDir()})
	if err := mgr.Init(); err == nil {
		t.Error("Init() should fail for unknown mode")
	}
}

func TestSSLManager_StatusBeforeInit(t *testing.T) {
	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: t.TempDir()})
	status := mgr.Status()
	if status.Valid {
		t.Error("Status should not be valid before Init()")
	}
}

func TestSSLManager_SetCustomCert(t *testing.T) {
	dir := t.TempDir()

	// Generate a self-signed cert to use as test data
	certDir := filepath.Join(dir, "generated")
	_, _, err := GenerateSelfSigned(certDir)
	if err != nil {
		t.Fatalf("generate test cert: %v", err)
	}

	certPEM, err := os.ReadFile(filepath.Join(certDir, "cert.pem"))
	if err != nil {
		t.Fatalf("read cert: %v", err)
	}
	keyPEM, err := os.ReadFile(filepath.Join(certDir, "key.pem"))
	if err != nil {
		t.Fatalf("read key: %v", err)
	}

	// Start as self-signed, then switch to custom
	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
	if err := mgr.SetCustomCert(certPEM, keyPEM); err != nil {
		t.Fatalf("SetCustomCert() error: %v", err)
	}

	if mgr.GetMode() != "custom" {
		t.Errorf("mode = %q, want %q", mgr.GetMode(), "custom")
	}

	status := mgr.Status()
	if !status.Valid {
		t.Error("cert should be valid after SetCustomCert")
	}

	// Verify TLS config works
	tlsCfg, err := mgr.GetTLSConfig()
	if err != nil {
		t.Fatalf("GetTLSConfig() error: %v", err)
	}
	if tlsCfg == nil {
		t.Fatal("GetTLSConfig() returned nil")
	}
}

func TestSSLManager_SetCustomCert_Invalid(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
	err := mgr.SetCustomCert([]byte("not a cert"), []byte("not a key"))
	if err == nil {
		t.Error("SetCustomCert() should fail with invalid PEM data")
	}
}

func TestSSLManager_Renew_NonAuto(t *testing.T) {
	dir := t.TempDir()

	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})
	if err := mgr.Init(); err != nil {
		t.Fatalf("Init() error: %v", err)
	}

	err := mgr.Renew(context.Background())
	if err == nil {
		t.Error("Renew() should fail for non-auto mode")
	}
}

func TestSSLManager_HTTPChallengeHandler(t *testing.T) {
	dir := t.TempDir()

	// Non-auto mode should return a redirect handler
	mgr := NewSSLManager(SSLManagerConfig{Mode: "self-signed", DataDir: dir})

	handler := mgr.HTTPChallengeHandler()
	if handler == nil {
		t.Fatal("HTTPChallengeHandler() returned nil")
	}

	// Test that it redirects HTTP to HTTPS
	req := httptest.NewRequest(http.MethodGet, "http://example.com/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMovedPermanently {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMovedPermanently)
	}
	location := rec.Header().Get("Location")
	if location != "https://example.com/test" {
		t.Errorf("Location = %q, want %q", location, "https://example.com/test")
	}
}

func TestSSLManager_GetMode(t *testing.T) {
	tests := []struct {
		name string
		mode string
	}{
		{"self-signed", "self-signed"},
		{"auto", "auto"},
		{"custom", "custom"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mgr := NewSSLManager(SSLManagerConfig{Mode: tt.mode, DataDir: t.TempDir()})
			if got := mgr.GetMode(); got != tt.mode {
				t.Errorf("GetMode() = %q, want %q", got, tt.mode)
			}
		})
	}
}
