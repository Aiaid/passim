package task

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

func TestEnqueueAndProcess(t *testing.T) {
	database := testDB(t)
	q := NewQueue(database, 10)

	var processed atomic.Int32
	q.RegisterHandler("test-job", func(ctx context.Context, task *Task) error {
		processed.Add(1)
		return nil
	})

	q.Start(2)
	defer q.Stop()

	taskID, err := q.Enqueue("test-job", "target-1", `{"key":"value"}`)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if taskID == "" {
		t.Fatal("empty task ID")
	}

	// Wait for processing
	deadline := time.After(3 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("timeout waiting for task to be processed")
		default:
			if processed.Load() > 0 {
				goto done
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
done:

	// Verify task is completed in DB
	got, err := Get(database, taskID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
}

func TestRetryOnFailure(t *testing.T) {
	database := testDB(t)
	q := NewQueue(database, 10)

	var attempts atomic.Int32
	q.RegisterHandler("flaky-job", func(ctx context.Context, task *Task) error {
		n := attempts.Add(1)
		if n < 3 {
			return fmt.Errorf("attempt %d failed", n)
		}
		return nil // succeed on 3rd attempt
	})

	q.Start(1)
	defer q.Stop()

	taskID, err := q.Enqueue("flaky-job", "", "{}")
	if err != nil {
		t.Fatal(err)
	}

	// Wait for all attempts
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatalf("timeout: only %d attempts", attempts.Load())
		default:
			if attempts.Load() >= 3 {
				goto done
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
done:

	// Give worker a moment to update DB after success
	time.Sleep(50 * time.Millisecond)

	got, _ := Get(database, taskID)
	if got.Status != StatusCompleted {
		t.Errorf("status = %q, want completed (after %d attempts)", got.Status, attempts.Load())
	}
	if got.Retries != 2 {
		t.Errorf("retries = %d, want 2", got.Retries)
	}
}

func TestMaxRetriesExceeded(t *testing.T) {
	database := testDB(t)
	q := NewQueue(database, 10)

	var attempts atomic.Int32
	q.RegisterHandler("always-fail", func(ctx context.Context, task *Task) error {
		attempts.Add(1)
		return fmt.Errorf("always fails")
	})

	q.Start(1)
	defer q.Stop()

	taskID, err := q.Enqueue("always-fail", "", "{}")
	if err != nil {
		t.Fatal(err)
	}

	// Wait for all retry attempts (max_retries=3, so 3 attempts total)
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatalf("timeout: only %d attempts", attempts.Load())
		default:
			if attempts.Load() >= 3 {
				goto done
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
done:

	// Give worker a moment to update DB
	time.Sleep(50 * time.Millisecond)

	got, _ := Get(database, taskID)
	if got.Status != StatusFailed {
		t.Errorf("status = %q, want failed", got.Status)
	}
	if got.Result != "always fails" {
		t.Errorf("result = %q", got.Result)
	}
	if got.Retries != 3 {
		t.Errorf("retries = %d, want 3", got.Retries)
	}
}
