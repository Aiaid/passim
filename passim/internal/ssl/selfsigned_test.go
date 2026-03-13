package ssl

import (
	"crypto/x509"
	"encoding/pem"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGenerateSelfSigned(t *testing.T) {
	dir := t.TempDir()

	certPath, keyPath, err := GenerateSelfSigned(dir)
	if err != nil {
		t.Fatalf("GenerateSelfSigned() error: %v", err)
	}

	// Check files exist
	if _, err := os.Stat(certPath); err != nil {
		t.Fatalf("cert file does not exist: %v", err)
	}
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("key file does not exist: %v", err)
	}

	// Check file paths
	if certPath != filepath.Join(dir, "cert.pem") {
		t.Errorf("certPath = %s, want %s", certPath, filepath.Join(dir, "cert.pem"))
	}
	if keyPath != filepath.Join(dir, "key.pem") {
		t.Errorf("keyPath = %s, want %s", keyPath, filepath.Join(dir, "key.pem"))
	}

	// Key file should have restricted permissions
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("stat key file: %v", err)
	}
	perm := info.Mode().Perm()
	if perm&0077 != 0 {
		t.Errorf("key file permissions = %o, want no group/other access", perm)
	}
}

func TestGenerateSelfSigned_ValidCert(t *testing.T) {
	dir := t.TempDir()

	certPath, _, err := GenerateSelfSigned(dir)
	if err != nil {
		t.Fatalf("GenerateSelfSigned() error: %v", err)
	}

	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("read cert: %v", err)
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		t.Fatal("failed to decode PEM block")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	// Check validity period
	if time.Now().Before(cert.NotBefore) {
		t.Error("cert is not yet valid")
	}
	if time.Now().After(cert.NotAfter) {
		t.Error("cert has expired")
	}

	// Should be valid for roughly 10 years
	duration := cert.NotAfter.Sub(cert.NotBefore)
	if duration < 9*365*24*time.Hour || duration > 11*365*24*time.Hour {
		t.Errorf("cert validity duration = %v, want ~10 years", duration)
	}

	// Check issuer
	if cert.Issuer.CommonName != "passim" {
		t.Errorf("issuer CN = %q, want %q", cert.Issuer.CommonName, "passim")
	}

	// Check subject
	if len(cert.Subject.Organization) == 0 || cert.Subject.Organization[0] != "Passim Self-Signed" {
		t.Errorf("subject org = %v, want [Passim Self-Signed]", cert.Subject.Organization)
	}
}

func TestGenerateSelfSigned_SANs(t *testing.T) {
	dir := t.TempDir()

	certPath, _, err := GenerateSelfSigned(dir)
	if err != nil {
		t.Fatalf("GenerateSelfSigned() error: %v", err)
	}

	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("read cert: %v", err)
	}

	block, _ := pem.Decode(certPEM)
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	// Check DNS SANs
	hasLocalhost := false
	for _, name := range cert.DNSNames {
		if name == "localhost" {
			hasLocalhost = true
		}
	}
	if !hasLocalhost {
		t.Error("cert missing DNS SAN 'localhost'")
	}

	// Check IP SANs
	has127 := false
	hasIPv6 := false
	for _, ip := range cert.IPAddresses {
		if ip.Equal(net.ParseIP("127.0.0.1")) {
			has127 = true
		}
		if ip.Equal(net.ParseIP("::1")) {
			hasIPv6 = true
		}
	}
	if !has127 {
		t.Error("cert missing IP SAN 127.0.0.1")
	}
	if !hasIPv6 {
		t.Error("cert missing IP SAN ::1")
	}
}

func TestGenerateSelfSigned_SubDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "certs")

	_, _, err := GenerateSelfSigned(dir)
	if err != nil {
		t.Fatalf("GenerateSelfSigned() with nested dir error: %v", err)
	}
}

func TestCollectSANs(t *testing.T) {
	ips, dnsNames := collectSANs()

	if len(dnsNames) == 0 || dnsNames[0] != "localhost" {
		t.Errorf("dnsNames = %v, want [localhost ...]", dnsNames)
	}

	has127 := false
	hasIPv6 := false
	for _, ip := range ips {
		if ip.Equal(net.ParseIP("127.0.0.1")) {
			has127 = true
		}
		if ip.Equal(net.ParseIP("::1")) {
			hasIPv6 = true
		}
	}
	if !has127 {
		t.Error("collectSANs missing 127.0.0.1")
	}
	if !hasIPv6 {
		t.Error("collectSANs missing ::1")
	}
}
