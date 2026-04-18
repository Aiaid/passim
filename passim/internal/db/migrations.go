package db

import (
	"database/sql"
	"fmt"
)

var migrations = []string{
	`CREATE TABLE IF NOT EXISTS config (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS passkeys (
		id              TEXT PRIMARY KEY,
		credential_id   BLOB NOT NULL UNIQUE,
		public_key      BLOB NOT NULL,
		name            TEXT,
		sign_count      INTEGER DEFAULT 0,
		backup_eligible INTEGER DEFAULT 0,
		backup_state    INTEGER DEFAULT 0,
		created_at      TEXT DEFAULT (datetime('now')),
		last_used_at    TEXT
	)`,

	`CREATE TABLE IF NOT EXISTS remote_nodes (
		id         TEXT PRIMARY KEY,
		name       TEXT,
		address    TEXT NOT NULL,
		api_key    TEXT NOT NULL,
		status     TEXT DEFAULT 'disconnected',
		country    TEXT,
		last_seen  TEXT,
		created_at TEXT DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS apps (
		id           TEXT PRIMARY KEY,
		template     TEXT NOT NULL,
		settings     TEXT NOT NULL,
		status       TEXT DEFAULT 'stopped',
		container_id TEXT,
		deployed_at  TEXT,
		updated_at   TEXT DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS remote_deployments (
		id          TEXT PRIMARY KEY,
		node_id     TEXT NOT NULL,
		template    TEXT NOT NULL,
		settings    TEXT NOT NULL,
		status      TEXT DEFAULT 'queued',
		error       TEXT,
		deployed_at TEXT,
		updated_at  TEXT DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS tasks (
		id          TEXT PRIMARY KEY,
		type        TEXT NOT NULL,
		target      TEXT,
		payload     TEXT NOT NULL,
		status      TEXT DEFAULT 'queued',
		result      TEXT,
		retries     INTEGER DEFAULT 0,
		max_retries INTEGER DEFAULT 3,
		created_at  TEXT DEFAULT (datetime('now')),
		finished_at TEXT
	)`,

	`CREATE TABLE IF NOT EXISTS s3_credentials (
		id         TEXT PRIMARY KEY,
		name       TEXT,
		endpoint   TEXT,
		bucket     TEXT,
		access_key TEXT,
		secret_key TEXT,
		created_at TEXT DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS share_tokens (
		id         TEXT PRIMARY KEY,
		app_id     TEXT NOT NULL,
		user_index INTEGER DEFAULT 0,
		token      TEXT NOT NULL UNIQUE,
		created_at TEXT DEFAULT (datetime('now')),
		revoked    INTEGER DEFAULT 0
	)`,

	`CREATE TABLE IF NOT EXISTS app_users (
		id          TEXT PRIMARY KEY,
		app_id      TEXT NOT NULL,
		username    TEXT NOT NULL,
		password    TEXT NOT NULL,
		enabled     INTEGER DEFAULT 1,
		quota_bytes INTEGER DEFAULT 0,
		created_at  TEXT DEFAULT (datetime('now')),
		updated_at  TEXT DEFAULT (datetime('now')),
		UNIQUE(app_id, username)
	)`,

	`CREATE TABLE IF NOT EXISTS app_traffic_logs (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		app_id      TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		tx_bytes    INTEGER NOT NULL,
		rx_bytes    INTEGER NOT NULL,
		recorded_at TEXT DEFAULT (datetime('now'))
	)`,

	`CREATE INDEX IF NOT EXISTS idx_traffic_app_user_time
		ON app_traffic_logs(app_id, user_id, recorded_at)`,

	`CREATE INDEX IF NOT EXISTS idx_app_users_app
		ON app_users(app_id)`,

	`CREATE TABLE IF NOT EXISTS stacks (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL UNIQUE,
		yaml_text  TEXT NOT NULL,
		env_text   TEXT NOT NULL DEFAULT '',
		profiles   TEXT NOT NULL DEFAULT '[]',
		status     TEXT NOT NULL DEFAULT 'stopped',
		last_error TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT DEFAULT (datetime('now'))
	)`,
}

// alterColumns are idempotent column additions for existing tables.
// Errors (e.g. "duplicate column") are silently ignored.
var alterColumns = []string{
	`ALTER TABLE passkeys ADD COLUMN backup_eligible INTEGER DEFAULT 0`,
	`ALTER TABLE passkeys ADD COLUMN backup_state INTEGER DEFAULT 0`,
	`ALTER TABLE apps ADD COLUMN generated TEXT DEFAULT '{}'`,
	`ALTER TABLE remote_nodes ADD COLUMN skip_tls_verify INTEGER DEFAULT 0`,
}

func Migrate(database *sql.DB) error {
	for i, m := range migrations {
		if _, err := database.Exec(m); err != nil {
			return fmt.Errorf("migration %d: %w", i, err)
		}
	}
	for _, a := range alterColumns {
		database.Exec(a) // ignore "duplicate column" errors
	}
	return nil
}
