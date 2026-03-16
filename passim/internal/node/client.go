package node

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/sse"
)

// defaultHTTPClient returns an http.Client that skips TLS verification
// (remote Passim nodes use self-signed certificates by default).
func defaultHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

// connectNode manages the lifecycle of a single remote node connection.
// It authenticates, subscribes to SSE, and handles reconnection.
func (h *Hub) connectNode(ctx context.Context, rc *RemoteConn) {
	rc.mu.Lock()
	rc.status = "connecting"
	rc.mu.Unlock()

	_ = db.UpdateRemoteNodeStatus(h.db, rc.info.ID, "connecting")

	// Initial login
	if err := h.loginToRemote(ctx, rc); err != nil {
		log.Printf("[hub] login to %s failed: %v", rc.info.Address, err)
		h.reconnectLoop(ctx, rc)
		return
	}

	// Subscribe to SSE stream
	if err := h.subscribeSSE(ctx, rc); err != nil {
		log.Printf("[hub] SSE to %s failed: %v", rc.info.Address, err)
		h.reconnectLoop(ctx, rc)
		return
	}
}

// loginToRemote authenticates with a remote node using its API key.
// POST https://<address>/api/auth/login {"api_key": "<key>"}
func (h *Hub) loginToRemote(ctx context.Context, rc *RemoteConn) error {
	rc.mu.RLock()
	address := rc.info.Address
	apiKey := rc.info.APIKey
	client := rc.httpClient
	rc.mu.RUnlock()

	token, err := loginRemote(ctx, client, address, apiKey)
	if err != nil {
		return err
	}

	rc.mu.Lock()
	rc.token = token
	rc.mu.Unlock()

	return nil
}

// loginRemote performs the actual HTTP login request. Factored out so AddNode can
// use it before the RemoteConn is fully constructed.
func loginRemote(ctx context.Context, client *http.Client, address, apiKey string) (string, error) {
	loginURL := fmt.Sprintf("https://%s/api/auth/login", address)
	payload, _ := json.Marshal(map[string]string{"api_key": apiKey})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, loginURL, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("build login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read login response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("login failed with status %d: %s", resp.StatusCode, string(body))
	}

	var loginResp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &loginResp); err != nil {
		return "", fmt.Errorf("parse login response: %w", err)
	}
	if loginResp.Token == "" {
		return "", fmt.Errorf("empty token in login response")
	}

	return loginResp.Token, nil
}

// subscribeSSE connects to a remote node's /api/stream SSE endpoint
// and processes events until disconnection or context cancellation.
func (h *Hub) subscribeSSE(ctx context.Context, rc *RemoteConn) error {
	rc.mu.RLock()
	address := rc.info.Address
	token := rc.token
	client := rc.httpClient
	nodeID := rc.info.ID
	rc.mu.RUnlock()

	sseCtx, sseCancel := context.WithCancel(ctx)
	rc.mu.Lock()
	rc.sseCancel = sseCancel
	rc.mu.Unlock()

	streamURL := fmt.Sprintf("https://%s/api/stream?token=%s", address, token)
	req, err := http.NewRequestWithContext(sseCtx, http.MethodGet, streamURL, nil)
	if err != nil {
		sseCancel()
		return fmt.Errorf("build SSE request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := client.Do(req)
	if err != nil {
		sseCancel()
		return fmt.Errorf("SSE connect: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		sseCancel()
		return fmt.Errorf("SSE returned status %d", resp.StatusCode)
	}

	// Mark as connected
	rc.mu.Lock()
	rc.status = "connected"
	rc.lastSeen = time.Now().UTC()
	rc.mu.Unlock()

	_ = db.UpdateRemoteNodeStatus(h.db, nodeID, "connected")
	_ = db.UpdateRemoteNodeLastSeen(h.db, nodeID, rc.info.Country)

	// Parse SSE events
	defer resp.Body.Close()
	defer sseCancel()

	scanner := bufio.NewScanner(resp.Body)
	var eventType string
	var dataLines []string

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
			continue
		}

		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, strings.TrimPrefix(line, "data: "))
			continue
		}

		// Empty line signals end of event
		if line == "" && len(dataLines) > 0 {
			data := strings.Join(dataLines, "\n")
			h.handleSSEEvent(rc, nodeID, eventType, data)

			// Reset for next event
			eventType = ""
			dataLines = dataLines[:0]
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("SSE read: %w", err)
	}

	return fmt.Errorf("SSE stream closed")
}

// handleSSEEvent processes a single SSE event from a remote node.
func (h *Hub) handleSSEEvent(rc *RemoteConn, nodeID, eventType, data string) {
	rc.mu.Lock()
	rc.lastSeen = time.Now().UTC()
	rc.mu.Unlock()

	switch eventType {
	case "metrics":
		var m NodeMetrics
		if err := json.Unmarshal([]byte(data), &m); err != nil {
			log.Printf("[hub] node %s: failed to parse metrics: %v", nodeID, err)
			return
		}
		rc.mu.Lock()
		rc.metrics = &m
		rc.mu.Unlock()

		if h.broker != nil {
			h.broker.Publish(sse.Event{
				Topic: "node:" + nodeID,
				Type:  "metrics",
				Data:  data,
			})
		}

	case "status":
		// Extract country from status event
		var statusResp struct {
			Node struct {
				Country string `json:"country"`
			} `json:"node"`
		}
		if err := json.Unmarshal([]byte(data), &statusResp); err == nil && statusResp.Node.Country != "" {
			rc.mu.Lock()
			rc.info.Country = statusResp.Node.Country
			rc.mu.Unlock()
			_ = db.UpdateRemoteNodeLastSeen(h.db, nodeID, statusResp.Node.Country)
		}

		if h.broker != nil {
			h.broker.Publish(sse.Event{
				Topic: "node:" + nodeID,
				Type:  "status",
				Data:  data,
			})
		}

	case "containers":
		var containers []NodeContainer
		if err := json.Unmarshal([]byte(data), &containers); err != nil {
			log.Printf("[hub] node %s: failed to parse containers: %v", nodeID, err)
			return
		}
		rc.mu.Lock()
		rc.containers = containers
		rc.mu.Unlock()

		if h.broker != nil {
			h.broker.Publish(sse.Event{
				Topic: "node:" + nodeID,
				Type:  "containers",
				Data:  data,
			})
		}

	case "apps":
		if h.broker != nil {
			h.broker.Publish(sse.Event{
				Topic: "node:" + nodeID,
				Type:  "apps",
				Data:  data,
			})
		}

	default:
		// Forward app-specific events: "app:<appId>" → "node:<nodeID>:app:<appId>"
		if strings.HasPrefix(eventType, "app:") {
			if h.broker != nil {
				h.broker.Publish(sse.Event{
					Topic: "node:" + nodeID + ":" + eventType,
					Type:  eventType,
					Data:  data,
				})
			}
		}
	}
}

// reconnectLoop attempts to reconnect to a remote node with exponential backoff.
// Backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap).
func (h *Hub) reconnectLoop(ctx context.Context, rc *RemoteConn) {
	rc.mu.Lock()
	rc.status = "disconnected"
	rc.mu.Unlock()

	_ = db.UpdateRemoteNodeStatus(h.db, rc.info.ID, "disconnected")

	backoff := time.Second
	maxBackoff := 60 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		log.Printf("[hub] reconnecting to %s (backoff %s)", rc.info.Address, backoff)

		rc.mu.Lock()
		rc.status = "connecting"
		rc.mu.Unlock()
		_ = db.UpdateRemoteNodeStatus(h.db, rc.info.ID, "connecting")

		// Try login
		if err := h.loginToRemote(ctx, rc); err != nil {
			log.Printf("[hub] reconnect login to %s failed: %v", rc.info.Address, err)
			rc.mu.Lock()
			rc.status = "disconnected"
			rc.mu.Unlock()
			_ = db.UpdateRemoteNodeStatus(h.db, rc.info.ID, "disconnected")

			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			continue
		}

		// Try SSE
		if err := h.subscribeSSE(ctx, rc); err != nil {
			log.Printf("[hub] reconnect SSE to %s failed: %v", rc.info.Address, err)
			rc.mu.Lock()
			rc.status = "disconnected"
			rc.mu.Unlock()
			_ = db.UpdateRemoteNodeStatus(h.db, rc.info.ID, "disconnected")

			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			continue
		}

		// Success — SSE returned, which means it disconnected again
		// Reset backoff and keep going
		backoff = time.Second
	}
}
