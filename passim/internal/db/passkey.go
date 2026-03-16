package db

import (
	"database/sql"
	"fmt"
	"time"
)

// Passkey represents a WebAuthn passkey credential row.
type Passkey struct {
	ID             string `json:"id"`
	CredentialID   []byte `json:"credential_id"`
	PublicKey      []byte `json:"public_key"`
	Name           string `json:"name"`
	SignCount      uint32 `json:"sign_count"`
	BackupEligible bool   `json:"backup_eligible"`
	BackupState    bool   `json:"backup_state"`
	CreatedAt      string `json:"created_at"`
	LastUsedAt     string `json:"last_used_at"`
}

func CreatePasskey(database *sql.DB, p *Passkey) error {
	_, err := database.Exec(
		`INSERT INTO passkeys (id, credential_id, public_key, name, sign_count, backup_eligible, backup_state) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.CredentialID, p.PublicKey, p.Name, p.SignCount, p.BackupEligible, p.BackupState,
	)
	if err != nil {
		return fmt.Errorf("create passkey: %w", err)
	}
	return nil
}

func GetPasskey(database *sql.DB, id string) (*Passkey, error) {
	var p Passkey
	err := database.QueryRow(
		`SELECT id, credential_id, public_key, COALESCE(name,''), sign_count, backup_eligible, backup_state, COALESCE(created_at,''), COALESCE(last_used_at,'')
		 FROM passkeys WHERE id = ?`, id,
	).Scan(&p.ID, &p.CredentialID, &p.PublicKey, &p.Name, &p.SignCount, &p.BackupEligible, &p.BackupState, &p.CreatedAt, &p.LastUsedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get passkey %s: %w", id, err)
	}
	return &p, nil
}

func GetPasskeyByCredentialID(database *sql.DB, credentialID []byte) (*Passkey, error) {
	var p Passkey
	err := database.QueryRow(
		`SELECT id, credential_id, public_key, COALESCE(name,''), sign_count, backup_eligible, backup_state, COALESCE(created_at,''), COALESCE(last_used_at,'')
		 FROM passkeys WHERE credential_id = ?`, credentialID,
	).Scan(&p.ID, &p.CredentialID, &p.PublicKey, &p.Name, &p.SignCount, &p.BackupEligible, &p.BackupState, &p.CreatedAt, &p.LastUsedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get passkey by credential_id: %w", err)
	}
	return &p, nil
}

func ListPasskeys(database *sql.DB) ([]Passkey, error) {
	rows, err := database.Query(
		`SELECT id, credential_id, public_key, COALESCE(name,''), sign_count, backup_eligible, backup_state, COALESCE(created_at,''), COALESCE(last_used_at,'')
		 FROM passkeys ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list passkeys: %w", err)
	}
	defer rows.Close()

	var passkeys []Passkey
	for rows.Next() {
		var p Passkey
		if err := rows.Scan(&p.ID, &p.CredentialID, &p.PublicKey, &p.Name, &p.SignCount, &p.BackupEligible, &p.BackupState, &p.CreatedAt, &p.LastUsedAt); err != nil {
			return nil, fmt.Errorf("scan passkey: %w", err)
		}
		passkeys = append(passkeys, p)
	}
	return passkeys, rows.Err()
}

func UpdatePasskeySignCount(database *sql.DB, id string, signCount uint32) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := database.Exec(
		`UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?`,
		signCount, now, id,
	)
	if err != nil {
		return fmt.Errorf("update passkey sign count %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("passkey %s not found", id)
	}
	return nil
}

func DeletePasskey(database *sql.DB, id string) error {
	res, err := database.Exec(`DELETE FROM passkeys WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete passkey %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("passkey %s not found", id)
	}
	return nil
}

// HasPasskeys returns true if any passkeys exist in the database.
func HasPasskeys(database *sql.DB) (bool, error) {
	var count int
	err := database.QueryRow(`SELECT COUNT(*) FROM passkeys`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("has passkeys: %w", err)
	}
	return count > 0, nil
}
