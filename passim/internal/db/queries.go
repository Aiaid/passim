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
	Status      string `json:"status"`
	ContainerID string `json:"container_id"`
	DeployedAt  string `json:"deployed_at"`
	UpdatedAt   string `json:"updated_at"`
}

func CreateApp(database *sql.DB, app *App) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := database.Exec(
		`INSERT INTO apps (id, template, settings, status, container_id, deployed_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		app.ID, app.Template, app.Settings, app.Status, app.ContainerID, now, now,
	)
	if err != nil {
		return fmt.Errorf("create app: %w", err)
	}
	return nil
}

func GetApp(database *sql.DB, id string) (*App, error) {
	var a App
	err := database.QueryRow(
		`SELECT id, template, settings, status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps WHERE id = ?`, id,
	).Scan(&a.ID, &a.Template, &a.Settings, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt)
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
		`SELECT id, template, settings, status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps ORDER BY updated_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list apps: %w", err)
	}
	defer rows.Close()

	var apps []App
	for rows.Next() {
		var a App
		if err := rows.Scan(&a.ID, &a.Template, &a.Settings, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt); err != nil {
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
		`SELECT id, template, settings, status, COALESCE(container_id,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM apps WHERE template = ? AND status IN ('running', 'deploying') LIMIT 1`, templateName,
	).Scan(&a.ID, &a.Template, &a.Settings, &a.Status, &a.ContainerID, &a.DeployedAt, &a.UpdatedAt)
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
