package template

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net"
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

// randomPort finds an available TCP port by binding to :0 and returning
// the port assigned by the OS.
func randomPort() int {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}
