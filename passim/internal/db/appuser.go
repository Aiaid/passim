package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// AppUser represents a user belonging to a deployed app.
type AppUser struct {
	ID         string `json:"id"`
	AppID      string `json:"app_id"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Enabled    bool   `json:"enabled"`
	QuotaBytes int64  `json:"quota_bytes"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

func CreateAppUser(database *sql.DB, u *AppUser) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := database.Exec(
		`INSERT INTO app_users (id, app_id, username, password, enabled, quota_bytes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.AppID, u.Username, u.Password, boolToInt(u.Enabled), u.QuotaBytes, now, now,
	)
	if err != nil {
		return fmt.Errorf("create app user: %w", err)
	}
	return nil
}

func GetAppUser(database *sql.DB, id string) (*AppUser, error) {
	var u AppUser
	var enabled int
	err := database.QueryRow(
		`SELECT id, app_id, username, password, enabled, quota_bytes, COALESCE(created_at,''), COALESCE(updated_at,'')
		 FROM app_users WHERE id = ?`, id,
	).Scan(&u.ID, &u.AppID, &u.Username, &u.Password, &enabled, &u.QuotaBytes, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get app user %s: %w", id, err)
	}
	u.Enabled = enabled != 0
	return &u, nil
}

func GetAppUserByUsername(database *sql.DB, appID, username string) (*AppUser, error) {
	var u AppUser
	var enabled int
	err := database.QueryRow(
		`SELECT id, app_id, username, password, enabled, quota_bytes, COALESCE(created_at,''), COALESCE(updated_at,'')
		 FROM app_users WHERE app_id = ? AND username = ?`, appID, username,
	).Scan(&u.ID, &u.AppID, &u.Username, &u.Password, &enabled, &u.QuotaBytes, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get app user by username %s/%s: %w", appID, username, err)
	}
	u.Enabled = enabled != 0
	return &u, nil
}

func ListAppUsers(database *sql.DB, appID string) ([]AppUser, error) {
	rows, err := database.Query(
		`SELECT id, app_id, username, password, enabled, quota_bytes, COALESCE(created_at,''), COALESCE(updated_at,'')
		 FROM app_users WHERE app_id = ? ORDER BY created_at`, appID,
	)
	if err != nil {
		return nil, fmt.Errorf("list app users: %w", err)
	}
	defer rows.Close()

	var users []AppUser
	for rows.Next() {
		var u AppUser
		var enabled int
		if err := rows.Scan(&u.ID, &u.AppID, &u.Username, &u.Password, &enabled, &u.QuotaBytes, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan app user: %w", err)
		}
		u.Enabled = enabled != 0
		users = append(users, u)
	}
	return users, rows.Err()
}

func UpdateAppUser(database *sql.DB, id string, fields map[string]interface{}) error {
	if len(fields) == 0 {
		return nil
	}

	allowed := map[string]bool{
		"username": true, "password": true, "enabled": true, "quota_bytes": true,
	}

	var setClauses []string
	var args []interface{}
	for k, v := range fields {
		if !allowed[k] {
			return fmt.Errorf("update app user: unknown field %q", k)
		}
		if k == "enabled" {
			switch val := v.(type) {
			case bool:
				v = boolToInt(val)
			}
		}
		setClauses = append(setClauses, k+" = ?")
		args = append(args, v)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, now)
	args = append(args, id)

	query := fmt.Sprintf("UPDATE app_users SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	res, err := database.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("update app user %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app user %s not found", id)
	}
	return nil
}

func DeleteAppUser(database *sql.DB, id string) error {
	res, err := database.Exec(`DELETE FROM app_users WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete app user %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app user %s not found", id)
	}
	return nil
}

func DeleteAppUsersByApp(database *sql.DB, appID string) error {
	_, err := database.Exec(`DELETE FROM app_users WHERE app_id = ?`, appID)
	if err != nil {
		return fmt.Errorf("delete app users by app %s: %w", appID, err)
	}
	return nil
}

func CountAppUsers(database *sql.DB, appID string) (int, error) {
	var count int
	err := database.QueryRow(`SELECT COUNT(*) FROM app_users WHERE app_id = ?`, appID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count app users: %w", err)
	}
	return count, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
