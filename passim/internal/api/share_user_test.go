package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

func TestUserConnectionURI(t *testing.T) {
	tests := []struct {
		name     string
		baseURI  string
		username string
		password string
		want     string
	}{
		{
			name:     "basic replacement",
			baseURI:  "hysteria2://admin%3Aoldpw@example.com:443/?sni=example.com#mynode",
			username: "alice",
			password: "secret123",
			want:     "hysteria2://alice%3Asecret123@example.com:443/?sni=example.com#mynode",
		},
		{
			name:     "special chars in password",
			baseURI:  "hysteria2://admin%3Aoldpw@example.com:443/?sni=example.com",
			username: "bob",
			password: "p@ss:word",
			want:     "hysteria2://bob%3Ap@ss:word@example.com:443/?sni=example.com",
		},
		{
			name:     "empty base URI",
			baseURI:  "",
			username: "alice",
			password: "pw",
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := userConnectionURI(tt.baseURI, tt.username, tt.password)
			if got != tt.want {
				t.Errorf("userConnectionURI() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSharePerUserURI(t *testing.T) {
	reg := template.NewRegistry()
	if err := reg.LoadDir(templateDir(t)); err != nil {
		t.Fatal(err)
	}

	mock := &docker.MockClient{}
	router, database, apiKey := testServerFull(t, mock, reg)
	token := getToken(t, router, apiKey)

	// Create a hysteria app
	app := &db.App{
		ID:       "share-user-test",
		Template: "hysteria",
		Settings: `{"port":443,"password":"adminpw"}`,
		Status:   "running",
	}
	if err := db.CreateApp(database, app); err != nil {
		t.Fatal(err)
	}

	// Create a user
	w := doRequest(router, "POST", "/api/apps/"+app.ID+"/users", token, map[string]interface{}{
		"username": "friend1",
		"password": "friendpw",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create user: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var created appUserResponse
	json.Unmarshal(w.Body.Bytes(), &created)

	// The created user should have a share URL
	if created.ShareURL == "" {
		t.Fatal("expected non-empty share_url for created user")
	}

	// Extract the share token from URL (last path segment)
	shareToken := created.ShareURL[len(created.ShareURL)-36:] // UUID is 36 chars

	// Now hit the public share endpoint
	w = doRequest(router, "GET", "/api/s/"+shareToken, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("share config: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var shareResp shareResponse
	json.Unmarshal(w.Body.Bytes(), &shareResp)

	if shareResp.Type != "url" {
		t.Fatalf("expected type=url, got %q", shareResp.Type)
	}

	// The URI in the share response should contain user's credentials, not admin's
	if len(shareResp.URLs) == 0 {
		t.Fatal("expected at least one URL in share response")
	}

	uri := shareResp.URLs[0].Scheme
	if uri == "" {
		// URI may be empty if node context can't resolve (no public IP in test env)
		t.Skip("URI empty in test environment (no public IP)")
	}

	// Should contain friend1's credentials, not admin's
	if !containsSubstring(uri, "friend1") {
		t.Errorf("share URI should contain user's username 'friend1', got: %s", uri)
	}
	if containsSubstring(uri, "adminpw") {
		t.Errorf("share URI should NOT contain admin password, got: %s", uri)
	}
}

func containsSubstring(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
