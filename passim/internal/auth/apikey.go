package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

const apiKeyBytes = 32

func GenerateAPIKey() (plain string, hash string, err error) {
	b := make([]byte, apiKeyBytes)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate key: %w", err)
	}
	plain = "psk_" + hex.EncodeToString(b)
	hash = HashAPIKey(plain)
	return plain, hash, nil
}

func HashAPIKey(key string) string {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:])
}

func VerifyAPIKey(key, hash string) bool {
	return HashAPIKey(key) == hash
}
