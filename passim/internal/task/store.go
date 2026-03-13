package task

import (
	"database/sql"
	"fmt"
	"time"
)

// Insert persists a new task to the database.
func Insert(db *sql.DB, t *Task) error {
	_, err := db.Exec(
		`INSERT INTO tasks (id, type, target, payload, status, retries, max_retries)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Type, t.Target, t.Payload, t.Status, t.Retries, t.MaxRetries,
	)
	if err != nil {
		return fmt.Errorf("insert task: %w", err)
	}
	return nil
}

// Get retrieves a single task by ID.
func Get(db *sql.DB, id string) (*Task, error) {
	var t Task
	err := db.QueryRow(
		`SELECT id, type, COALESCE(target,''), payload, status,
		        COALESCE(result,''), retries, max_retries,
		        COALESCE(created_at,''), COALESCE(finished_at,'')
		 FROM tasks WHERE id = ?`, id,
	).Scan(&t.ID, &t.Type, &t.Target, &t.Payload, &t.Status,
		&t.Result, &t.Retries, &t.MaxRetries,
		&t.CreatedAt, &t.FinishedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get task %s: %w", id, err)
	}
	return &t, nil
}

// List returns all tasks ordered by created_at descending (most recent first).
func List(db *sql.DB) ([]Task, error) {
	rows, err := db.Query(
		`SELECT id, type, COALESCE(target,''), payload, status,
		        COALESCE(result,''), retries, max_retries,
		        COALESCE(created_at,''), COALESCE(finished_at,'')
		 FROM tasks ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Type, &t.Target, &t.Payload, &t.Status,
			&t.Result, &t.Retries, &t.MaxRetries,
			&t.CreatedAt, &t.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// UpdateStatus updates the status, result, retries, and optionally finished_at of a task.
func UpdateStatus(db *sql.DB, id string, status string, result string, retries int) error {
	var finishedAt interface{}
	if status == StatusCompleted || status == StatusFailed {
		finishedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := db.Exec(
		`UPDATE tasks SET status = ?, result = ?, retries = ?, finished_at = ? WHERE id = ?`,
		status, result, retries, finishedAt, id,
	)
	if err != nil {
		return fmt.Errorf("update task %s: %w", id, err)
	}
	return nil
}

// RecoverPending sets all tasks with status "running" back to "queued"
// so they can be re-processed after a restart.
func RecoverPending(db *sql.DB) ([]Task, error) {
	_, err := db.Exec(
		`UPDATE tasks SET status = ? WHERE status = ?`,
		StatusQueued, StatusRunning,
	)
	if err != nil {
		return nil, fmt.Errorf("recover pending tasks: %w", err)
	}

	// Return tasks that need to be re-enqueued
	rows, err := db.Query(
		`SELECT id, type, COALESCE(target,''), payload, status,
		        COALESCE(result,''), retries, max_retries,
		        COALESCE(created_at,''), COALESCE(finished_at,'')
		 FROM tasks WHERE status = ?`, StatusQueued,
	)
	if err != nil {
		return nil, fmt.Errorf("list recovered tasks: %w", err)
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Type, &t.Target, &t.Payload, &t.Status,
			&t.Result, &t.Retries, &t.MaxRetries,
			&t.CreatedAt, &t.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan recovered task: %w", err)
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}
