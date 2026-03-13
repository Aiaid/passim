package db

import (
	"database/sql"
	"fmt"
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
