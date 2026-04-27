package setup

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/passim/passim/internal/db"
)

func withFastRetry(t *testing.T) {
	t.Helper()
	prev := joinRetryInterval
	joinRetryInterval = 5 * time.Millisecond
	t.Cleanup(func() { joinRetryInterval = prev })
}

func TestMaybeJoinHub_NoEnv(t *testing.T) {
	database := testDB(t)
	// All envs unset → no-op, no panic, no hub_joined write.
	MaybeJoinHub(context.Background(), database, nil, "8443", "k")

	v, _ := db.GetConfig(database, "hub_joined")
	if v != "" {
		t.Fatalf("hub_joined unexpectedly set to %q", v)
	}
}

func TestMaybeJoinHub_NoAPIKey(t *testing.T) {
	t.Setenv("INVITE", "psk_invite_x")
	t.Setenv("HUB", "https://hub.example")
	database := testDB(t)
	MaybeJoinHub(context.Background(), database, nil, "8443", "")
	if v, _ := db.GetConfig(database, "hub_joined"); v != "" {
		t.Fatalf("hub_joined set despite empty api key: %q", v)
	}
}

func TestMaybeJoinHub_AlreadyJoined(t *testing.T) {
	t.Setenv("INVITE", "psk_invite_x")
	t.Setenv("HUB", "https://hub.example")
	t.Setenv("NODE_ADDR", "https://b.example:8443")

	database := testDB(t)
	db.SetConfig(database, hubJoinedConfKey, "https://hub.example")

	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	t.Setenv("HUB", srv.URL)
	// Pretend already joined to *this* HUB url.
	db.SetConfig(database, hubJoinedConfKey, srv.URL)

	MaybeJoinHub(context.Background(), database, nil, "8443", "k")
	time.Sleep(50 * time.Millisecond)
	if got := atomic.LoadInt32(&hits); got != 0 {
		t.Fatalf("expected zero hub hits, got %d", got)
	}
}

func TestRetryJoin_Success201(t *testing.T) {
	withFastRetry(t)
	database := testDB(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"id":"node-1","status":"joined"}`))
	}))
	defer srv.Close()

	retryJoin(context.Background(), srv.URL, "psk_invite_x", "b", "https://b.example", "k", false, database)

	v, _ := db.GetConfig(database, hubJoinedConfKey)
	if v != srv.URL {
		t.Fatalf("hub_joined = %q, want %q", v, srv.URL)
	}
}

func TestRetryJoin_Stops401(t *testing.T) {
	withFastRetry(t)
	database := testDB(t)

	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	retryJoin(context.Background(), srv.URL, "psk_invite_x", "", "https://b", "k", false, database)

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("expected 1 call, got %d", got)
	}
	if v, _ := db.GetConfig(database, hubJoinedConfKey); v != "" {
		t.Fatalf("hub_joined unexpectedly set: %q", v)
	}
}

func TestRetryJoin_Stops409(t *testing.T) {
	withFastRetry(t)
	database := testDB(t)

	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusConflict)
	}))
	defer srv.Close()

	retryJoin(context.Background(), srv.URL, "psk_invite_x", "", "https://b", "k", false, database)

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("expected 1 call, got %d", got)
	}
	if v, _ := db.GetConfig(database, hubJoinedConfKey); v != srv.URL {
		t.Fatalf("hub_joined = %q, want %q", v, srv.URL)
	}
}

func TestRetryJoin_RetriesOn500(t *testing.T) {
	withFastRetry(t)
	database := testDB(t)

	var mu sync.Mutex
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls++
		c := calls
		mu.Unlock()
		if c < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	retryJoin(context.Background(), srv.URL, "psk_invite_x", "", "https://b", "k", false, database)

	mu.Lock()
	got := calls
	mu.Unlock()
	if got < 3 {
		t.Fatalf("expected >=3 calls, got %d", got)
	}
	if v, _ := db.GetConfig(database, hubJoinedConfKey); v != srv.URL {
		t.Fatalf("hub_joined = %q", v)
	}
}

func TestRetryJoin_StopsOnContextCancel(t *testing.T) {
	withFastRetry(t)
	database := testDB(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	done := make(chan struct{})
	go func() {
		retryJoin(ctx, srv.URL, "psk_invite_x", "", "https://b", "k", false, database)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("retryJoin did not stop on ctx cancel")
	}
}
