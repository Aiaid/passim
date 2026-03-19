package ssl

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

// SSLStatus represents the current state of SSL configuration.
type SSLStatus struct {
	Mode      string `json:"mode"`
	Valid     bool   `json:"valid"`
	Domain    string `json:"domain,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"`
	Issuer    string `json:"issuer,omitempty"`
}

// SSLManagerConfig holds configuration for creating an SSLManager.
type SSLManagerConfig struct {
	Mode       string // "self-signed" | "auto" | "custom"
	DataDir    string
	Domain     string // explicit domain for "auto" mode (optional if BaseDomain is set)
	BaseDomain string // DNS reflector base domain (e.g., "dns.passim.io"); auto-discovers domain from public IP
	Email      string // optional, for ACME contact
}

// SSLManager manages TLS certificates for the server.
type SSLManager struct {
	mode        string
	dataDir     string
	domain      string
	baseDomain  string
	email       string
	certPath    string
	keyPath     string
	autocertMgr *autocert.Manager // for auto mode
}

// NewSSLManager creates a new SSLManager with the given configuration.
// Supported modes: "self-signed", "auto" (alias: "letsencrypt"), "custom", "off".
func NewSSLManager(cfg SSLManagerConfig) *SSLManager {
	mode := cfg.Mode
	// Normalize user-friendly aliases
	if mode == "letsencrypt" {
		mode = "auto"
	}
	return &SSLManager{
		mode:       mode,
		dataDir:    cfg.DataDir,
		domain:     cfg.Domain,
		baseDomain: cfg.BaseDomain,
		email:      cfg.Email,
	}
}

// Init initialises the SSL manager based on its mode.
func (m *SSLManager) Init() error {
	switch m.mode {
	case "self-signed":
		return m.initSelfSigned()
	case "auto":
		return m.initAuto()
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

func (m *SSLManager) initAuto() error {
	// Auto-discover domain from public IP + DNS reflector base domain
	if m.domain == "" && m.baseDomain != "" {
		domain, err := DiscoverDomain(m.baseDomain)
		if err != nil {
			return fmt.Errorf("auto-discover domain: %w", err)
		}
		m.domain = domain
		log.Printf("SSL auto: discovered domain %s via DNS reflector", m.domain)
	}

	if m.domain == "" {
		return fmt.Errorf("domain required for auto SSL mode (set SSL_DOMAIN or DNS_BASE_DOMAIN)")
	}
	m.autocertMgr = &autocert.Manager{
		Cache:      autocert.DirCache(filepath.Join(m.dataDir, "ssl", "autocert")),
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist(m.domain),
		Email:      m.email,
	}
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
	switch m.mode {
	case "auto":
		if m.autocertMgr == nil {
			return nil, fmt.Errorf("autocert not initialized; call Init() first")
		}
		tlsCfg := m.autocertMgr.TLSConfig()
		tlsCfg.MinVersion = tls.VersionTLS12
		return tlsCfg, nil
	default:
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
}

// Status returns the current SSL status.
func (m *SSLManager) Status() SSLStatus {
	status := SSLStatus{
		Mode: m.mode,
	}

	switch m.mode {
	case "auto":
		status.Domain = m.domain
		// Try reading cert from autocert cache
		cacheDir := filepath.Join(m.dataDir, "ssl", "autocert")
		certPEM, err := os.ReadFile(filepath.Join(cacheDir, m.domain))
		if err != nil {
			return status // cert not yet obtained
		}
		parsed := parseCertStatus(certPEM)
		status.Valid = parsed.Valid
		status.ExpiresAt = parsed.ExpiresAt
		status.Issuer = parsed.Issuer
		if parsed.Domain != "" {
			status.Domain = parsed.Domain
		}
		return status
	default:
		if m.certPath == "" {
			return status
		}

		certPEM, err := os.ReadFile(m.certPath)
		if err != nil {
			return status
		}

		parsed := parseCertStatus(certPEM)
		status.Valid = parsed.Valid
		status.ExpiresAt = parsed.ExpiresAt
		status.Issuer = parsed.Issuer
		status.Domain = parsed.Domain
		return status
	}
}

// parseCertStatus extracts SSL status fields from PEM-encoded certificate data.
func parseCertStatus(certPEM []byte) SSLStatus {
	var status SSLStatus

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

// Renew forces certificate renewal for auto mode.
func (m *SSLManager) Renew(ctx context.Context) error {
	if m.mode != "auto" {
		return fmt.Errorf("renewal only applicable for auto mode")
	}
	if m.autocertMgr == nil {
		return fmt.Errorf("autocert not initialized")
	}
	// Delete cached cert to force re-issuance on next TLS handshake
	cacheDir := filepath.Join(m.dataDir, "ssl", "autocert")
	os.Remove(filepath.Join(cacheDir, m.domain))
	return nil
}

// SetCustomCert stores a user-provided certificate and key, switching to custom mode.
func (m *SSLManager) SetCustomCert(certPEM, keyPEM []byte) error {
	// Validate the pair
	if _, err := tls.X509KeyPair(certPEM, keyPEM); err != nil {
		return fmt.Errorf("invalid certificate/key pair: %w", err)
	}
	certDir := filepath.Join(m.dataDir, "certs")
	if err := os.MkdirAll(certDir, 0755); err != nil {
		return fmt.Errorf("create cert directory: %w", err)
	}
	certPath := filepath.Join(certDir, "cert.pem")
	keyPath := filepath.Join(certDir, "key.pem")
	if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
		return fmt.Errorf("write cert: %w", err)
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return fmt.Errorf("write key: %w", err)
	}
	m.mode = "custom"
	m.certPath = certPath
	m.keyPath = keyPath
	return nil
}

// HTTPChallengeHandler returns an HTTP handler for ACME HTTP-01 challenges.
// For non-auto modes, it redirects HTTP to HTTPS.
func (m *SSLManager) HTTPChallengeHandler() http.Handler {
	if m.mode == "auto" && m.autocertMgr != nil {
		return m.autocertMgr.HTTPHandler(nil) // nil fallback = redirect to HTTPS
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target := "https://" + r.Host + r.URL.RequestURI()
		http.Redirect(w, r, target, http.StatusMovedPermanently)
	})
}

// GetMode returns the current SSL mode.
func (m *SSLManager) GetMode() string {
	return m.mode
}

// GetDomain returns the SSL domain (user-provided or DNS-reflector-discovered).
func (m *SSLManager) GetDomain() string {
	return m.domain
}

// ExportCertPEM returns the current TLS certificate and key as PEM strings.
// Works for all modes: self-signed, auto (via autocert Manager), custom.
func (m *SSLManager) ExportCertPEM() (certPEM, keyPEM string, err error) {
	switch m.mode {
	case "auto":
		if m.autocertMgr == nil || m.domain == "" {
			return "", "", fmt.Errorf("autocert not initialized")
		}
		// Get the cert from autocert Manager (memory + cache, triggers ACME if needed)
		hello := &tls.ClientHelloInfo{ServerName: m.domain}
		tlsCert, err := m.autocertMgr.GetCertificate(hello)
		if err != nil {
			return "", "", fmt.Errorf("get autocert certificate: %w", err)
		}
		// Encode cert chain as PEM
		var certBuf, keyBuf bytes.Buffer
		for _, der := range tlsCert.Certificate {
			pem.Encode(&certBuf, &pem.Block{Type: "CERTIFICATE", Bytes: der})
		}
		// Encode private key
		switch key := tlsCert.PrivateKey.(type) {
		case *ecdsa.PrivateKey:
			b, err := x509.MarshalECPrivateKey(key)
			if err != nil {
				return "", "", fmt.Errorf("marshal EC key: %w", err)
			}
			pem.Encode(&keyBuf, &pem.Block{Type: "EC PRIVATE KEY", Bytes: b})
		case *rsa.PrivateKey:
			b := x509.MarshalPKCS1PrivateKey(key)
			pem.Encode(&keyBuf, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: b})
		default:
			return "", "", fmt.Errorf("unsupported key type: %T", tlsCert.PrivateKey)
		}
		return certBuf.String(), keyBuf.String(), nil

	default: // self-signed, custom
		if m.certPath == "" || m.keyPath == "" {
			return "", "", fmt.Errorf("no cert available")
		}
		certData, err := os.ReadFile(m.certPath)
		if err != nil {
			return "", "", fmt.Errorf("read cert: %w", err)
		}
		keyData, err := os.ReadFile(m.keyPath)
		if err != nil {
			return "", "", fmt.Errorf("read key: %w", err)
		}
		return string(certData), string(keyData), nil
	}
}

// ExportToShared writes the current cert/key to {dataDir}/ssl/shared/ for
// child containers to mount. Returns true if the cert content changed.
func (m *SSLManager) ExportToShared() (changed bool, err error) {
	sharedDir := filepath.Join(m.dataDir, "ssl", "shared")
	if err := os.MkdirAll(sharedDir, 0755); err != nil {
		return false, fmt.Errorf("create shared dir: %w", err)
	}

	cert, key, err := m.ExportCertPEM()
	if err != nil {
		return false, err
	}

	certPath := filepath.Join(sharedDir, "cert.pem")
	keyPath := filepath.Join(sharedDir, "key.pem")

	// Check if content changed
	oldCert, _ := os.ReadFile(certPath)
	if string(oldCert) == cert {
		return false, nil
	}

	if err := os.WriteFile(certPath, []byte(cert), 0644); err != nil {
		return false, fmt.Errorf("write cert: %w", err)
	}
	if err := os.WriteFile(keyPath, []byte(key), 0600); err != nil {
		return false, fmt.Errorf("write key: %w", err)
	}

	log.Printf("SSL cert exported to %s", sharedDir)
	return true, nil
}

// SharedCertDir returns the path to the shared cert directory.
func (m *SSLManager) SharedCertDir() string {
	return filepath.Join(m.dataDir, "ssl", "shared")
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
