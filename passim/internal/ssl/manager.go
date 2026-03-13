package ssl

import (
	"crypto/tls"
	"fmt"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"time"
)

// SSLStatus represents the current state of SSL configuration.
type SSLStatus struct {
	Mode      string `json:"mode"`
	Valid     bool   `json:"valid"`
	Domain    string `json:"domain,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"`
	Issuer    string `json:"issuer,omitempty"`
}

// SSLManager manages TLS certificates for the server.
type SSLManager struct {
	mode     string
	dataDir  string
	certPath string
	keyPath  string
}

// NewSSLManager creates a new SSLManager with the given mode and data directory.
// Supported modes: "self-signed", "auto", "custom".
func NewSSLManager(mode, dataDir string) *SSLManager {
	return &SSLManager{
		mode:    mode,
		dataDir: dataDir,
	}
}

// Init initialises the SSL manager based on its mode.
func (m *SSLManager) Init() error {
	switch m.mode {
	case "self-signed":
		return m.initSelfSigned()
	case "auto":
		// Stub: certmagic not yet implemented
		return nil
	case "custom":
		return m.initCustom()
	default:
		return fmt.Errorf("unknown SSL mode: %s", m.mode)
	}
}

func (m *SSLManager) initSelfSigned() error {
	certDir := filepath.Join(m.dataDir, "certs")
	certPath := filepath.Join(certDir, "cert.pem")
	keyPath := filepath.Join(certDir, "key.pem")

	// If cert and key already exist, just use them.
	if fileExists(certPath) && fileExists(keyPath) {
		m.certPath = certPath
		m.keyPath = keyPath
		return nil
	}

	cp, kp, err := GenerateSelfSigned(certDir)
	if err != nil {
		return fmt.Errorf("generate self-signed cert: %w", err)
	}
	m.certPath = cp
	m.keyPath = kp
	return nil
}

func (m *SSLManager) initCustom() error {
	certPath := filepath.Join(m.dataDir, "certs", "cert.pem")
	keyPath := filepath.Join(m.dataDir, "certs", "key.pem")

	if !fileExists(certPath) {
		return fmt.Errorf("custom cert not found: %s", certPath)
	}
	if !fileExists(keyPath) {
		return fmt.Errorf("custom key not found: %s", keyPath)
	}

	m.certPath = certPath
	m.keyPath = keyPath
	return nil
}

// GetTLSConfig returns a *tls.Config for use with http.Server.
func (m *SSLManager) GetTLSConfig() (*tls.Config, error) {
	if m.mode == "auto" {
		return nil, fmt.Errorf("auto mode not yet implemented")
	}

	if m.certPath == "" || m.keyPath == "" {
		return nil, fmt.Errorf("SSL not initialised; call Init() first")
	}

	cert, err := tls.LoadX509KeyPair(m.certPath, m.keyPath)
	if err != nil {
		return nil, fmt.Errorf("load TLS key pair: %w", err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}, nil
}

// Status returns the current SSL status.
func (m *SSLManager) Status() SSLStatus {
	status := SSLStatus{
		Mode: m.mode,
	}

	if m.mode == "auto" {
		// Stub
		return status
	}

	if m.certPath == "" {
		return status
	}

	certPEM, err := os.ReadFile(m.certPath)
	if err != nil {
		return status
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return status
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return status
	}

	status.Valid = time.Now().Before(cert.NotAfter) && time.Now().After(cert.NotBefore)
	status.ExpiresAt = cert.NotAfter.UTC().Format(time.RFC3339)
	status.Issuer = cert.Issuer.CommonName

	if len(cert.DNSNames) > 0 {
		status.Domain = cert.DNSNames[0]
	}

	return status
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
