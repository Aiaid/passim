package db

import (
	"database/sql"
	"fmt"
	"time"
)

// InviteToken is a reusable cluster-join invite. Tokens stay valid until the
// expiry passes or they are explicitly revoked; there is no single-use bit.
type InviteToken struct {
	Token     string `json:"token"`
	Note      string `json:"note"`
	ExpiresAt int64  `json:"expires_at"`
	CreatedAt int64  `json:"created_at"`
	RevokedAt *int64 `json:"revoked_at,omitempty"`
}

func CreateInviteToken(database *sql.DB, t *InviteToken) error {
	_, err := database.Exec(
		`INSERT INTO invite_tokens (token, note, expires_at, created_at, revoked_at)
		 VALUES (?, ?, ?, ?, ?)`,
		t.Token, t.Note, t.ExpiresAt, t.CreatedAt, t.RevokedAt,
	)
	if err != nil {
		return fmt.Errorf("create invite token: %w", err)
	}
	return nil
}

func GetInviteToken(database *sql.DB, token string) (*InviteToken, error) {
	var t InviteToken
	var revoked sql.NullInt64
	err := database.QueryRow(
		`SELECT token, COALESCE(note,''), expires_at, created_at, revoked_at
		 FROM invite_tokens WHERE token = ?`, token,
	).Scan(&t.Token, &t.Note, &t.ExpiresAt, &t.CreatedAt, &revoked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get invite token: %w", err)
	}
	if revoked.Valid {
		v := revoked.Int64
		t.RevokedAt = &v
	}
	return &t, nil
}

// ListActiveInviteTokens returns invites that are neither revoked nor expired.
func ListActiveInviteTokens(database *sql.DB) ([]InviteToken, error) {
	now := time.Now().Unix()
	rows, err := database.Query(
		`SELECT token, COALESCE(note,''), expires_at, created_at, revoked_at
		 FROM invite_tokens
		 WHERE revoked_at IS NULL AND expires_at > ?
		 ORDER BY created_at DESC`, now,
	)
	if err != nil {
		return nil, fmt.Errorf("list invite tokens: %w", err)
	}
	defer rows.Close()

	var out []InviteToken
	for rows.Next() {
		var t InviteToken
		var revoked sql.NullInt64
		if err := rows.Scan(&t.Token, &t.Note, &t.ExpiresAt, &t.CreatedAt, &revoked); err != nil {
			return nil, fmt.Errorf("scan invite token: %w", err)
		}
		if revoked.Valid {
			v := revoked.Int64
			t.RevokedAt = &v
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func RevokeInviteToken(database *sql.DB, token string) error {
	now := time.Now().Unix()
	res, err := database.Exec(
		`UPDATE invite_tokens SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL`,
		now, token,
	)
	if err != nil {
		return fmt.Errorf("revoke invite token: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("invite token not found")
	}
	return nil
}

// ValidateInviteToken returns the token row only when it exists, is not
// revoked, and is not expired. Otherwise (nil, nil) — caller treats absence
// as auth failure.
func ValidateInviteToken(database *sql.DB, token string) (*InviteToken, error) {
	t, err := GetInviteToken(database, token)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, nil
	}
	if t.RevokedAt != nil {
		return nil, nil
	}
	if t.ExpiresAt <= time.Now().Unix() {
		return nil, nil
	}
	return t, nil
}
