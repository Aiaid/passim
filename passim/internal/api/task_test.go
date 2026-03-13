package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/passim/passim/internal/task"
)

func TestListTasks_Empty(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var tasks []task.Task
	json.Unmarshal(w.Body.Bytes(), &tasks)
	if len(tasks) != 0 {
		t.Errorf("expected empty list, got %d", len(tasks))
	}
}

func TestListTasks_WithTasks(t *testing.T) {
	router, database, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	// Insert tasks directly into DB
	task.Insert(database, &task.Task{
		ID: "task-1", Type: "deploy", Payload: "{}", Status: task.StatusQueued, MaxRetries: 3,
	})
	task.Insert(database, &task.Task{
		ID: "task-2", Type: "undeploy", Target: "app-1", Payload: "{}", Status: task.StatusCompleted, MaxRetries: 3,
	})

	req := httptest.NewRequest("GET", "/api/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var tasks []task.Task
	json.Unmarshal(w.Body.Bytes(), &tasks)
	if len(tasks) != 2 {
		t.Errorf("expected 2 tasks, got %d", len(tasks))
	}
}

func TestGetTask(t *testing.T) {
	router, database, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	task.Insert(database, &task.Task{
		ID: "task-get-1", Type: "deploy", Target: "app-x", Payload: `{"image":"nginx"}`,
		Status: task.StatusRunning, MaxRetries: 3,
	})

	req := httptest.NewRequest("GET", "/api/tasks/task-get-1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var got task.Task
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.ID != "task-get-1" {
		t.Errorf("id = %q", got.ID)
	}
	if got.Type != "deploy" {
		t.Errorf("type = %q", got.Type)
	}
	if got.Target != "app-x" {
		t.Errorf("target = %q", got.Target)
	}
	if got.Status != task.StatusRunning {
		t.Errorf("status = %q", got.Status)
	}
}

func TestGetTask_NotFound(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/tasks/nonexistent-id", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestListTasks_RequiresAuth(t *testing.T) {
	router, _, _ := testServerNoDocker(t)

	req := httptest.NewRequest("GET", "/api/tasks", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
