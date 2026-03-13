package task

import (
	"context"
	"database/sql"
	"log"
)

// worker reads tasks from the channel and executes the matching handler.
func worker(ctx context.Context, db *sql.DB, ch chan *Task, handlers func(string) (TaskHandler, bool)) {
	for {
		select {
		case <-ctx.Done():
			return
		case t, ok := <-ch:
			if !ok {
				return
			}
			processTask(ctx, db, t, ch, handlers)
		}
	}
}

func processTask(ctx context.Context, db *sql.DB, t *Task, ch chan *Task, handlers func(string) (TaskHandler, bool)) {
	// Mark as running
	if err := UpdateStatus(db, t.ID, StatusRunning, "", t.Retries); err != nil {
		log.Printf("task %s: failed to mark running: %v", t.ID, err)
		return
	}

	handler, ok := handlers(t.Type)
	if !ok {
		log.Printf("task %s: no handler for type %q", t.ID, t.Type)
		_ = UpdateStatus(db, t.ID, StatusFailed, "no handler for type: "+t.Type, t.Retries)
		return
	}

	err := handler(ctx, t)
	if err != nil {
		t.Retries++
		if t.Retries < t.MaxRetries {
			// Re-enqueue for retry
			log.Printf("task %s: failed (attempt %d/%d): %v", t.ID, t.Retries, t.MaxRetries, err)
			_ = UpdateStatus(db, t.ID, StatusQueued, err.Error(), t.Retries)
			// Push back to channel (non-blocking to avoid deadlock)
			select {
			case ch <- t:
			default:
				log.Printf("task %s: channel full, task will be recovered on restart", t.ID)
			}
		} else {
			log.Printf("task %s: failed permanently after %d retries: %v", t.ID, t.Retries, err)
			_ = UpdateStatus(db, t.ID, StatusFailed, err.Error(), t.Retries)
		}
		return
	}

	// Success
	_ = UpdateStatus(db, t.ID, StatusCompleted, "", t.Retries)
}
