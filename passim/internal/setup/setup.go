package setup

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
)

// Init checks if this is a first-time startup. If so, it generates
// node_id, API Key, JWT secret and auth_version=1. It prints the
// plaintext API key to stdout (only time it's visible).
// On subsequent starts it is a no-op.
func Init(database *sql.DB) error {
	existing, err := db.GetConfig(database, "node_id")
	if err != nil {
		return fmt.Errorf("check node_id: %w", err)
	}
	if existing != "" {
		return nil // already initialised
	}

	// Generate node ID
	nodeID := uuid.New().String()
	if err := db.SetConfig(database, "node_id", nodeID); err != nil {
		return err
	}

	// Generate API Key — store hash, print plaintext
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		return err
	}
	if err := db.SetConfig(database, "api_key_hash", hash); err != nil {
		return err
	}

	// Generate JWT secret
	secret, err := auth.GenerateSecret()
	if err != nil {
		return err
	}
	if err := db.SetConfig(database, "jwt_secret", secret); err != nil {
		return err
	}

	// Initialise auth version
	if err := db.SetConfig(database, "auth_version", "1"); err != nil {
		return err
	}

	log.Println("=== First-time setup complete ===")
	log.Printf("Node ID : %s", nodeID)
	log.Printf("API Key : %s", plain)
	log.Println("Save this API Key — it will not be shown again.")

	return nil
}
