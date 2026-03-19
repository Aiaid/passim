package api

import (
	"bufio"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/gorilla/websocket"
	"github.com/passim/passim/internal/docker"
)

func TestTerminal_RequireAuth(t *testing.T) {
	handler, _, _, _ := testServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc/terminal", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestTerminal_DockerUnavailable(t *testing.T) {
	handler, _, apiKey := testServerNoDocker(t)
	token := getToken(t, handler, apiKey)

	req := httptest.NewRequest(http.MethodGet, "/api/containers/abc/terminal?token="+token, nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestTerminal_ExecError(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)
	mockDocker.ExecInteractiveErr = errors.New("container not found")

	// Need a real HTTP server for WebSocket
	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/containers/abc/terminal?token=" + token
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()

	// Should receive a close message with the error
	_, _, err = ws.ReadMessage()
	if err == nil {
		t.Fatal("expected error from WebSocket read")
	}
	closeErr, ok := err.(*websocket.CloseError)
	if !ok {
		t.Fatalf("expected CloseError, got %T: %v", err, err)
	}
	if closeErr.Code != websocket.CloseInternalServerErr {
		t.Errorf("expected close code %d, got %d", websocket.CloseInternalServerErr, closeErr.Code)
	}
}

func TestTerminal_DataFlow(t *testing.T) {
	handler, _, apiKey, mockDocker := testServer(t)
	token := getToken(t, handler, apiKey)

	// Create a pipe to simulate Docker exec I/O
	serverConn, clientConn := net.Pipe()
	t.Cleanup(func() {
		serverConn.Close()
		clientConn.Close()
	})

	mockDocker.ExecInteractiveResult = &docker.ExecSession{
		ID: "exec-123",
		Conn: types.HijackedResponse{
			Conn:   serverConn,
			Reader: bufio.NewReader(serverConn),
		},
	}

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/containers/abc/terminal?token=" + token
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()

	// Send data from "container" to browser
	go func() {
		clientConn.Write([]byte("hello from container"))
	}()

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if string(msg) != "hello from container" {
		t.Errorf("expected 'hello from container', got %q", string(msg))
	}

	// Send data from browser to "container"
	err = ws.WriteMessage(websocket.BinaryMessage, []byte("ls\n"))
	if err != nil {
		t.Fatalf("write failed: %v", err)
	}

	buf := make([]byte, 64)
	clientConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, err := clientConn.Read(buf)
	if err != nil {
		t.Fatalf("docker side read failed: %v", err)
	}
	if string(buf[:n]) != "ls\n" {
		t.Errorf("expected 'ls\\n', got %q", string(buf[:n]))
	}

	// Test resize control message
	err = ws.WriteMessage(websocket.TextMessage, []byte(`{"type":"resize","cols":120,"rows":40}`))
	if err != nil {
		t.Fatalf("resize write failed: %v", err)
	}

	// Give time for the message to be processed
	time.Sleep(100 * time.Millisecond)

	// Verify ResizeExec was called
	found := false
	for _, call := range mockDocker.GetCalls() {
		if call.Method == "ResizeExec" {
			found = true
			if call.Args[0] != "exec-123" {
				t.Errorf("expected exec ID 'exec-123', got %v", call.Args[0])
			}
		}
	}
	if !found {
		t.Error("expected ResizeExec call")
	}
}
