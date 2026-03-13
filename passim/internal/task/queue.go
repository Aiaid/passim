package task

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"

	"github.com/google/uuid"
)

// Queue is an in-memory channel-based task queue backed by SQLite.
type Queue struct {
	db       *sql.DB
	ch       chan *Task
	handlers map[string]TaskHandler
	mu       sync.RWMutex
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

// NewQueue creates a new task queue. Call Start to begin processing.
func NewQueue(db *sql.DB, bufferSize int) *Queue {
	if bufferSize <= 0 {
		bufferSize = 100
	}
	return &Queue{
		db:       db,
		ch:       make(chan *Task, bufferSize),
		handlers: make(map[string]TaskHandler),
	}
}

// RegisterHandler registers a handler for a given task type.
func (q *Queue) RegisterHandler(taskType string, handler TaskHandler) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.handlers[taskType] = handler
}

// getHandler returns the handler for a task type (thread-safe).
func (q *Queue) getHandler(taskType string) (TaskHandler, bool) {
	q.mu.RLock()
	defer q.mu.RUnlock()
	h, ok := q.handlers[taskType]
	return h, ok
}

// Enqueue creates a new task, inserts it into the database, and sends it
// to the worker channel. Returns the task ID.
func (q *Queue) Enqueue(taskType, target, payload string) (string, error) {
	t := &Task{
		ID:         uuid.New().String(),
		Type:       taskType,
		Target:     target,
		Payload:    payload,
		Status:     StatusQueued,
		Retries:    0,
		MaxRetries: 3,
	}

	if err := Insert(q.db, t); err != nil {
		return "", fmt.Errorf("enqueue: %w", err)
	}

	select {
	case q.ch <- t:
	default:
		log.Printf("task %s: channel full, task will be recovered on restart", t.ID)
	}

	return t.ID, nil
}

// Start launches worker goroutines and recovers any pending tasks from the database.
func (q *Queue) Start(workers int) {
	ctx, cancel := context.WithCancel(context.Background())
	q.cancel = cancel

	// Recover pending tasks from previous runs
	recovered, err := RecoverPending(q.db)
	if err != nil {
		log.Printf("task queue: recover pending: %v", err)
	} else {
		for i := range recovered {
			select {
			case q.ch <- &recovered[i]:
			default:
				log.Printf("task queue: channel full during recovery, skipping task %s", recovered[i].ID)
			}
		}
		if len(recovered) > 0 {
			log.Printf("task queue: recovered %d pending tasks", len(recovered))
		}
	}

	// Start workers
	for i := 0; i < workers; i++ {
		q.wg.Add(1)
		go func() {
			defer q.wg.Done()
			worker(ctx, q.db, q.ch, q.getHandler)
		}()
	}
}

// Stop signals workers to stop and waits for them to finish.
func (q *Queue) Stop() {
	if q.cancel != nil {
		q.cancel()
	}
	q.wg.Wait()
}
