package task

import "context"

// Task status constants.
const (
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
)

// Task represents an async task persisted in SQLite.
type Task struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Target     string `json:"target"`
	Payload    string `json:"payload"`
	Status     string `json:"status"`
	Result     string `json:"result"`
	Retries    int    `json:"retries"`
	MaxRetries int    `json:"max_retries"`
	CreatedAt  string `json:"created_at"`
	FinishedAt string `json:"finished_at"`
}

// TaskHandler is the function signature for processing a task.
type TaskHandler func(ctx context.Context, task *Task) error
