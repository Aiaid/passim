package db

import (
	"database/sql"
	"fmt"
	"time"
)

func GetConfig(database *sql.DB, key string) (string, error) {
	var value string
	err := database.QueryRow("SELECT value FROM config WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get config %s: %w", key, err)
	}
	return value, nil
}

func SetConfig(database *sql.DB, key, value string) error {
	_, err := database.Exec(
		"INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	if err != nil {
		return fmt.Errorf("set config %s: %w", key, err)
	}
	return nil
}

// App represents a deployed application row.
type App struct {
	ID          string `json:"id"`
	Template    string `json:"template"`
	Settings    string `json:"settings"`
	Generated   string `json:"generated"`
	Status      string `json:"status"`
	ContainerID string `json:"container_id"`
	DeployedAt  string `json:"deployed_at"`
	UpdatedAt   string `json:"updated_at"`
}

func CreateApp(database *sql.DB, app *App) error {
	now := time.Now().UTC().Format(time.RFC3339)
	generated := app.Generated
	if generated == "" {
		generated = "{}"
	}
	_, err := database.Exec(
		`INSERT INTO apps (id, template, settings, generated, status, container_id, deployed_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		app.ID, app.Template, app.Settings, generated, app.Status, app.ContainerID, now, now,
	)
	if err != nil {
		return fmt.Errorf("create app: %w", err)
	}
	return nil
}

func GetApp(database *sql.DB, id string) (*App, error) {
	var a App
	err := database.QueryRow(
		`SELECT id, template, settings, COALESCE(generated,'{}'), status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps WHERE id = ?`, id,
	).Scan(&a.ID, &a.Template, &a.Settings, &a.Generated, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get app %s: %w", id, err)
	}
	return &a, nil
}

func ListApps(database *sql.DB) ([]App, error) {
	rows, err := database.Query(
		`SELECT id, template, settings, COALESCE(generated,'{}'), status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps ORDER BY updated_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list apps: %w", err)
	}
	defer rows.Close()

	var apps []App
	for rows.Next() {
		var a App
		if err := rows.Scan(&a.ID, &a.Template, &a.Settings, &a.Generated, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan app: %w", err)
		}
		apps = append(apps, a)
	}
	return apps, rows.Err()
}

// GetActiveAppByTemplate returns an app that is running or deploying for the given template.
// Returns nil if no active app exists for this template.
func GetActiveAppByTemplate(database *sql.DB, templateName string) (*App, error) {
	var a App
	err := database.QueryRow(
		`SELECT id, template, settings, COALESCE(generated,'{}'), status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps WHERE template = ? AND status IN ('running', 'deploying') LIMIT 1`, templateName,
	).Scan(&a.ID, &a.Template, &a.Settings, &a.Generated, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get active app by template %s: %w", templateName, err)
	}
	return &a, nil
}

func UpdateApp(database *sql.DB, id string, status string, containerID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := database.Exec(
		`UPDATE apps SET status = ?, container_id = ?, updated_at = ? WHERE id = ?`,
		status, containerID, now, id,
	)
	if err != nil {
		return fmt.Errorf("update app %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app %s not found", id)
	}
	return nil
}

func UpdateAppSettings(database *sql.DB, id string, settings string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := database.Exec(
		`UPDATE apps SET settings = ?, updated_at = ? WHERE id = ?`,
		settings, now, id,
	)
	if err != nil {
		return fmt.Errorf("update app settings %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app %s not found", id)
	}
	return nil
}

func DeleteApp(database *sql.DB, id string) error {
	res, err := database.Exec(`DELETE FROM apps WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete app %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app %s not found", id)
	}
	return nil
}

// ShareToken represents a share token for public config access.
type ShareToken struct {
	ID        string `json:"id"`
	AppID     string `json:"app_id"`
	UserIndex int    `json:"user_index"`
	Token     string `json:"token"`
	CreatedAt string `json:"created_at"`
	Revoked   bool   `json:"revoked"`
}

func CreateShareToken(database *sql.DB, st *ShareToken) error {
	_, err := database.Exec(
		`INSERT INTO share_tokens (id, app_id, user_index, token) VALUES (?, ?, ?, ?)`,
		st.ID, st.AppID, st.UserIndex, st.Token,
	)
	if err != nil {
		return fmt.Errorf("create share token: %w", err)
	}
	return nil
}

func GetShareToken(database *sql.DB, token string) (*ShareToken, error) {
	var st ShareToken
	err := database.QueryRow(
		`SELECT id, app_id, user_index, token, COALESCE(created_at,''), revoked
		 FROM share_tokens WHERE token = ? AND revoked = 0`, token,
	).Scan(&st.ID, &st.AppID, &st.UserIndex, &st.Token, &st.CreatedAt, &st.Revoked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get share token: %w", err)
	}
	return &st, nil
}

func GetShareTokenByApp(database *sql.DB, appID string) (*ShareToken, error) {
	var st ShareToken
	err := database.QueryRow(
		`SELECT id, app_id, user_index, token, COALESCE(created_at,''), revoked
		 FROM share_tokens WHERE app_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1`, appID,
	).Scan(&st.ID, &st.AppID, &st.UserIndex, &st.Token, &st.CreatedAt, &st.Revoked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get share token by app: %w", err)
	}
	return &st, nil
}

func RevokeShareTokens(database *sql.DB, appID string) error {
	_, err := database.Exec(
		`UPDATE share_tokens SET revoked = 1 WHERE app_id = ? AND revoked = 0`, appID,
	)
	if err != nil {
		return fmt.Errorf("revoke share tokens: %w", err)
	}
	return nil
}
