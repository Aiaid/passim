package template

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"
)

const defaultRandomStringLength = 32

// charset for random string generation (alphanumeric)
const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// GenerateValues produces generated values based on the provided specs.
// Supported types: random_string, uuid_v4, random_port.
func GenerateValues(specs []GeneratedSpec) map[string]string {
	result := make(map[string]string, len(specs))
	for _, spec := range specs {
		switch spec.Type {
		case "random_string":
			length := spec.Length
			if length <= 0 {
				length = defaultRandomStringLength
			}
			result[spec.Key] = randomString(length)
		case "uuid_v4":
			result[spec.Key] = uuidV4()
		case "random_port":
			result[spec.Key] = fmt.Sprintf("%d", randomPort())
		case "tls_self_signed":
			cert, key := generateSelfSignedCert()
			result[spec.Key+"_cert"] = cert
			result[spec.Key+"_key"] = key
		default:
			result[spec.Key] = ""
		}
	}
	return result
}

// randomString generates a cryptographically random alphanumeric string.
func randomString(length int) string {
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			// Fallback: this should never happen with a working OS
			b[i] = charset[0]
			continue
		}
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

// uuidV4 generates a version 4 UUID using crypto/rand.
func uuidV4() string {
	var uuid [16]byte
	_, _ = rand.Read(uuid[:])
	uuid[6] = (uuid[6] & 0x0f) | 0x40 // version 4
	uuid[8] = (uuid[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		uuid[0:4], uuid[4:6], uuid[6:8], uuid[8:10], uuid[10:16])
}

// ResolveGeneratedDefaults replaces {{generated.KEY}} placeholder strings
// in merged settings with actual generated values. This is needed because
// ValidateSettings applies literal default strings like "{{generated.vpn_password}}"
// before generated values exist.
func ResolveGeneratedDefaults(merged map[string]interface{}, generated map[string]string) {
	for key, val := range merged {
		s, ok := val.(string)
		if !ok {
			continue
		}
		for gKey, gVal := range generated {
			placeholder := "{{generated." + gKey + "}}"
			if s == placeholder {
				merged[key] = gVal
				break
			}
		}
	}
}

// ResolveNodeDefaults replaces {{node.KEY}} placeholder strings in merged
// settings with actual node values. This handles template defaults like
// `default: "{{node.Domain}}"` that reference node context.
func ResolveNodeDefaults(merged map[string]interface{}, node NodeInfo) {
	nodeVars := map[string]string{
		"{{node.PublicIP}}":  node.PublicIP,
		"{{node.Hostname}}": node.Hostname,
		"{{node.Domain}}":   node.Domain,
		"{{node.DataDir}}":  node.DataDir,
		"{{node.Timezone}}": node.Timezone,
	}
	for key, val := range merged {
		s, ok := val.(string)
		if !ok {
			continue
		}
		if resolved, exists := nodeVars[s]; exists {
			merged[key] = resolved
		}
	}
}

// randomPort finds an available TCP port by binding to :0 and returning
// the port assigned by the OS.
func randomPort() int {
	l, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// generateSelfSignedCert creates a self-signed ECDSA certificate and returns
// the PEM-encoded certificate and private key strings.
func generateSelfSignedCert() (certPEM, keyPEM string) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", ""
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "hysteria"},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(100 * 365 * 24 * time.Hour), // ~100 years
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return "", ""
	}

	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return "", ""
	}

	var certBuf, keyBuf strings.Builder
	pem.Encode(&certBuf, &pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	pem.Encode(&keyBuf, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	return certBuf.String(), keyBuf.String()
}
