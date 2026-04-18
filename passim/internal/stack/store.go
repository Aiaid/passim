package stack

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Status values for Stack.Status.
const (
	StatusStopped     = "stopped"
	StatusDeploying   = "deploying"
	StatusRunning     = "running"
	StatusError       = "error"
	StatusTearingDown = "tearing_down"
)

// Stack is a row in the stacks table.
type Stack struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	YAMLText  string   `json:"yaml_text"`
	EnvText   string   `json:"env_text"`
	Profiles  []string `json:"profiles"`
	Status    string   `json:"status"`
	LastError string   `json:"last_error,omitempty"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

func Insert(db *sql.DB, s *Stack) error {
	if s.Status == "" {
		s.Status = StatusStopped
	}
	if s.Profiles == nil {
		s.Profiles = []string{}
	}
	profilesJSON, err := json.Marshal(s.Profiles)
	if err != nil {
		return fmt.Errorf("marshal profiles: %w", err)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	s.CreatedAt = now
	s.UpdatedAt = now
	_, err = db.Exec(
		`INSERT INTO stacks (id, name, yaml_text, env_text, profiles, status, last_error, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.Name, s.YAMLText, s.EnvText, string(profilesJSON), s.Status, nullIfEmpty(s.LastError), s.CreatedAt, s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert stack: %w", err)
	}
	return nil
}

func Get(db *sql.DB, id string) (*Stack, error) {
	return scanOne(db.QueryRow(
		`SELECT id, name, yaml_text, env_text, profiles, status, last_error, created_at, updated_at
		 FROM stacks WHERE id = ?`, id,
	))
}

func GetByName(db *sql.DB, name string) (*Stack, error) {
	return scanOne(db.QueryRow(
		`SELECT id, name, yaml_text, env_text, profiles, status, last_error, created_at, updated_at
		 FROM stacks WHERE name = ?`, name,
	))
}

func List(db *sql.DB) ([]Stack, error) {
	rows, err := db.Query(
		`SELECT id, name, yaml_text, env_text, profiles, status, last_error, created_at, updated_at
		 FROM stacks ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list stacks: %w", err)
	}
	defer rows.Close()

	var out []Stack
	for rows.Next() {
		s, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func UpdateStatus(db *sql.DB, id, status, lastError string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.Exec(
		`UPDATE stacks SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
		status, nullIfEmpty(lastError), now, id,
	)
	if err != nil {
		return fmt.Errorf("update stack status: %w", err)
	}
	return nil
}

func UpdateYAML(db *sql.DB, id, yamlText, envText string, profiles []string) error {
	profilesJSON, err := json.Marshal(profiles)
	if err != nil {
		return fmt.Errorf("marshal profiles: %w", err)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(
		`UPDATE stacks SET yaml_text = ?, env_text = ?, profiles = ?, updated_at = ? WHERE id = ?`,
		yamlText, envText, string(profilesJSON), now, id,
	)
	if err != nil {
		return fmt.Errorf("update stack yaml: %w", err)
	}
	return nil
}

func Delete(db *sql.DB, id string) error {
	_, err := db.Exec(`DELETE FROM stacks WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete stack: %w", err)
	}
	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanOne(row rowScanner) (*Stack, error) {
	s, err := scanRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

func scanRow(row rowScanner) (*Stack, error) {
	var s Stack
	var lastErr sql.NullString
	var profilesRaw string
	if err := row.Scan(
		&s.ID, &s.Name, &s.YAMLText, &s.EnvText, &profilesRaw,
		&s.Status, &lastErr, &s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if lastErr.Valid {
		s.LastError = lastErr.String
	}
	if profilesRaw != "" {
		if err := json.Unmarshal([]byte(profilesRaw), &s.Profiles); err != nil {
			return nil, fmt.Errorf("unmarshal profiles: %w", err)
		}
	}
	if s.Profiles == nil {
		s.Profiles = []string{}
	}
	return &s, nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
