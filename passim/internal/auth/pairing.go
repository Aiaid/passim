package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

const pairingTokenBytes = 16

type pairingEntry struct {
	Hash      string
	ExpiresAt time.Time
}

// PairingStore holds short-lived pairing tokens in memory.
// Tokens are one-time use and expire after a configurable TTL.
type PairingStore struct {
	mu      sync.Mutex
	entries []pairingEntry
}

func NewPairingStore() *PairingStore {
	return &PairingStore{}
}

// GeneratePairingToken creates a random pairing token with "ptk_" prefix.
func GeneratePairingToken() (string, error) {
	b := make([]byte, pairingTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate pairing token: %w", err)
	}
	return "ptk_" + hex.EncodeToString(b), nil
}

// Store adds a pairing token hash with the given TTL.
func (s *PairingStore) Store(token string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.purge()
	s.entries = append(s.entries, pairingEntry{
		Hash:      HashAPIKey(token),
		ExpiresAt: time.Now().Add(ttl),
	})
}

// Verify checks and consumes a pairing token (one-time use).
func (s *PairingStore) Verify(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.purge()
	hash := HashAPIKey(token)
	for i, e := range s.entries {
		if e.Hash == hash {
			s.entries = append(s.entries[:i], s.entries[i+1:]...)
			return true
		}
	}
	return false
}

func (s *PairingStore) purge() {
	now := time.Now()
	n := 0
	for _, e := range s.entries {
		if e.ExpiresAt.After(now) {
			s.entries[n] = e
			n++
		}
	}
	s.entries = s.entries[:n]
}
