package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/passim/passim/internal/db"
)

func TestCreateS3(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{
		"name":       "my-s3",
		"endpoint":   "s3.example.com",
		"bucket":     "backups",
		"access_key": "AKIA123",
		"secret_key": "secret456",
	})
	req := httptest.NewRequest("POST", "/api/s3", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp db.S3Credential
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.ID == "" {
		t.Error("empty ID")
	}
	if resp.Name != "my-s3" {
		t.Errorf("name = %q", resp.Name)
	}
	if resp.Endpoint != "s3.example.com" {
		t.Errorf("endpoint = %q", resp.Endpoint)
	}
	if resp.Bucket != "backups" {
		t.Errorf("bucket = %q", resp.Bucket)
	}
	if resp.AccessKey != "AKIA123" {
		t.Errorf("access_key = %q", resp.AccessKey)
	}
	if resp.SecretKey != "secret456" {
		t.Errorf("secret_key = %q", resp.SecretKey)
	}
}

func TestCreateS3_InvalidBody(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	// Missing required fields
	body, _ := json.Marshal(map[string]string{
		"name": "incomplete",
	})
	req := httptest.NewRequest("POST", "/api/s3", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListS3_Empty(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("GET", "/api/s3", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var creds []db.S3Credential
	json.Unmarshal(w.Body.Bytes(), &creds)
	if len(creds) != 0 {
		t.Errorf("expected empty list, got %d", len(creds))
	}
}

func TestS3Lifecycle(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	// Create
	body, _ := json.Marshal(map[string]string{
		"name":       "test-s3",
		"endpoint":   "s3.example.com",
		"bucket":     "mybucket",
		"access_key": "AKIA123",
		"secret_key": "secret456",
	})
	req := httptest.NewRequest("POST", "/api/s3", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created db.S3Credential
	json.Unmarshal(w.Body.Bytes(), &created)

	// List — should have 1
	req = httptest.NewRequest("GET", "/api/s3", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", w.Code)
	}
	var creds []db.S3Credential
	json.Unmarshal(w.Body.Bytes(), &creds)
	if len(creds) != 1 {
		t.Fatalf("list: expected 1, got %d", len(creds))
	}

	// Update
	body, _ = json.Marshal(map[string]string{
		"name":   "updated-s3",
		"bucket": "new-bucket",
	})
	req = httptest.NewRequest("PUT", "/api/s3/"+created.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated db.S3Credential
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Name != "updated-s3" {
		t.Errorf("name = %q, want %q", updated.Name, "updated-s3")
	}
	if updated.Bucket != "new-bucket" {
		t.Errorf("bucket = %q, want %q", updated.Bucket, "new-bucket")
	}
	// Unchanged fields should remain
	if updated.Endpoint != "s3.example.com" {
		t.Errorf("endpoint = %q, want %q", updated.Endpoint, "s3.example.com")
	}

	// Delete
	req = httptest.NewRequest("DELETE", "/api/s3/"+created.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// List — should be empty
	req = httptest.NewRequest("GET", "/api/s3", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	json.Unmarshal(w.Body.Bytes(), &creds)
	if len(creds) != 0 {
		t.Errorf("list after delete: expected 0, got %d", len(creds))
	}
}

func TestUpdateS3_NotFound(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	body, _ := json.Marshal(map[string]string{"name": "x"})
	req := httptest.NewRequest("PUT", "/api/s3/nonexistent", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestDeleteS3_NotFound(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("DELETE", "/api/s3/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestTestS3_NotImplemented(t *testing.T) {
	router, _, apiKey := testServerNoDocker(t)
	token := getToken(t, router, apiKey)

	req := httptest.NewRequest("POST", "/api/s3/some-id/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", w.Code)
	}
}

func TestS3_NoAuth(t *testing.T) {
	router, _, _ := testServerNoDocker(t)

	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/s3"},
		{"POST", "/api/s3"},
		{"PUT", "/api/s3/some-id"},
		{"DELETE", "/api/s3/some-id"},
		{"POST", "/api/s3/some-id/test"},
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401, got %d", ep.method, ep.path, w.Code)
		}
	}
}
