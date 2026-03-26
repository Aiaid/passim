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

// defaultTransport returns an http.Transport that skips TLS verification
// (remote Passim nodes use self-signed certificates by default).
func defaultTransport() *http.Transport {
	return &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
}

// defaultHTTPClient returns an http.Client for normal API calls (30s timeout).
func defaultHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   30 * time.Second,
		Transport: defaultTransport(),
	}
}

// sseHTTPClient returns an http.Client for long-lived SSE streams (no timeout).
// Cancellation is handled via context instead.
func sseHTTPClient() *http.Client {
	return &http.Client{
		Transport: defaultTransport(),
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

	result, err := loginRemote(ctx, client, address, apiKey)
	if err != nil {
		return err
	}

	rc.mu.Lock()
	rc.token = result.Token
	rc.scheme = result.Scheme
	rc.mu.Unlock()

	return nil
}

// loginResult holds the token and detected scheme from a remote login.
type loginResult struct {
	Token  string
	Scheme string // "https" or "http"
}

// loginRemote performs the actual HTTP login request. Tries HTTPS first,
// falls back to HTTP if the remote is not using TLS.
func loginRemote(ctx context.Context, client *http.Client, address, apiKey string) (*loginResult, error) {
	payload, _ := json.Marshal(map[string]string{"api_key": apiKey})

	// Try HTTPS first, then HTTP
	for _, scheme := range []string{"https", "http"} {
		loginURL := fmt.Sprintf("%s://%s/api/auth/login", scheme, address)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, loginURL, bytes.NewReader(payload))
		if err != nil {
			return nil, fmt.Errorf("build login request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			// If HTTPS fails, try HTTP
			if scheme == "https" {
				continue
			}
			return nil, fmt.Errorf("login request: %w", err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read login response: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("login failed with status %d: %s", resp.StatusCode, string(body))
		}

		var loginResp struct {
			Token string `json:"token"`
		}
		if err := json.Unmarshal(body, &loginResp); err != nil {
			return nil, fmt.Errorf("parse login response: %w", err)
		}
		if loginResp.Token == "" {
			return nil, fmt.Errorf("empty token in login response")
		}

		return &loginResult{Token: loginResp.Token, Scheme: scheme}, nil
	}

	return nil, fmt.Errorf("login failed: could not connect via HTTPS or HTTP")
}

// subscribeSSE connects to a remote node's /api/stream SSE endpoint
// and processes events until disconnection or context cancellation.
func (h *Hub) subscribeSSE(ctx context.Context, rc *RemoteConn) error {
	rc.mu.RLock()
	address := rc.info.Address
	token := rc.token
	rcScheme := rc.scheme
	nodeID := rc.info.ID
	rc.mu.RUnlock()

	scheme := rcScheme
	if scheme == "" {
		scheme = "https"
	}
	streamURL := fmt.Sprintf("%s://%s/api/stream?token=%s", scheme, address, token)

	sseCtx, sseCancel := context.WithCancel(ctx)
	rc.mu.Lock()
	rc.sseCancel = sseCancel
	rc.mu.Unlock()

	req, err := http.NewRequestWithContext(sseCtx, http.MethodGet, streamURL, nil)
	if err != nil {
		sseCancel()
		return fmt.Errorf("build SSE request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	// Use a dedicated SSE client without Timeout — the normal client's
	// 30s Timeout kills the long-lived SSE stream.
	sseClient := sseHTTPClient()
	resp, err := sseClient.Do(req)
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
		// Remote node sends metrics.SystemMetrics which uses "mem_percent",
		// not "memory_percent". Parse with matching field names.
		var raw struct {
			CPUPercent   float64 `json:"cpu_percent"`
			MemPercent   float64 `json:"mem_percent"`
			DiskPercent  float64 `json:"disk_percent"`
			NetBytesSent uint64  `json:"net_bytes_sent"`
			NetBytesRecv uint64  `json:"net_bytes_recv"`
		}
		if err := json.Unmarshal([]byte(data), &raw); err != nil {
			log.Printf("[hub] node %s: failed to parse metrics: %v", nodeID, err)
			return
		}
		rc.mu.Lock()
		rc.metrics = &NodeMetrics{
			CPUPercent:    raw.CPUPercent,
			MemoryPercent: raw.MemPercent,
			DiskPercent:   raw.DiskPercent,
			NetBytesSent:  raw.NetBytesSent,
			NetBytesRecv:  raw.NetBytesRecv,
		}
		rc.mu.Unlock()

		if h.broker != nil {
			h.broker.Publish(sse.Event{
				Topic: "node:" + nodeID,
				Type:  "metrics",
				Data:  data,
			})
		}

	case "status":
		// Extract country, coordinates, and version from status event
		var statusResp struct {
			Node struct {
				Country   string  `json:"country"`
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				Version   string  `json:"version"`
			} `json:"node"`
		}
		if err := json.Unmarshal([]byte(data), &statusResp); err == nil {
			rc.mu.Lock()
			if statusResp.Node.Country != "" {
				rc.info.Country = statusResp.Node.Country
			}
			if statusResp.Node.Latitude != 0 || statusResp.Node.Longitude != 0 {
				rc.latitude = statusResp.Node.Latitude
				rc.longitude = statusResp.Node.Longitude
			}
			if statusResp.Node.Version != "" {
				rc.version = statusResp.Node.Version
			}
			rc.mu.Unlock()
			if statusResp.Node.Country != "" {
				_ = db.UpdateRemoteNodeLastSeen(h.db, nodeID, statusResp.Node.Country)
			}
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
