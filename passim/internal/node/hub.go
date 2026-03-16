package node

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/sse"
)

// NodeInfo is the external representation of a remote node with live data.
type NodeInfo struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Address    string          `json:"address"`
	Status     string          `json:"status"`
	Country    string          `json:"country,omitempty"`
	Latitude   float64         `json:"latitude"`
	Longitude  float64         `json:"longitude"`
	LastSeen   string          `json:"last_seen,omitempty"`
	CreatedAt  string          `json:"created_at"`
	Metrics    *NodeMetrics    `json:"metrics,omitempty"`
	Containers []NodeContainer `json:"containers,omitempty"`
}

// NodeMetrics holds lightweight metrics from a remote node.
type NodeMetrics struct {
	CPUPercent    float64            `json:"cpu_percent"`
	MemoryPercent float64           `json:"memory_percent"`
	DiskPercent   float64           `json:"disk_percent"`
	Containers    ContainersSummary `json:"containers"`
}

// ContainersSummary holds running/total counts from a remote node.
type ContainersSummary struct {
	Running int `json:"running"`
	Total   int `json:"total"`
}

// NodeContainer holds basic container info from a remote node.
type NodeContainer struct {
	Name  string `json:"name"`
	State string `json:"state"`
	Image string `json:"image"`
}

// Hub manages connections to remote Passim instances.
// It subscribes to each remote node's /api/stream SSE for real-time data,
// and calls their REST API for operations.
type Hub struct {
	mu     sync.RWMutex
	nodes  map[string]*RemoteConn
	db     *sql.DB
	broker *sse.Broker
	ctx    context.Context
	cancel context.CancelFunc

	// newHTTPClient is a factory for creating HTTP clients.
	// Override in tests to inject custom transports.
	newHTTPClient func() *http.Client
}

// RemoteConn holds the live connection state for a single remote node.
type RemoteConn struct {
	mu         sync.RWMutex
	info       db.RemoteNode
	status     string // connecting, connected, disconnected
	lastSeen   time.Time
	latitude   float64
	longitude  float64
	metrics    *NodeMetrics
	containers []NodeContainer
	token      string // JWT from remote login
	scheme     string // "https" or "http", auto-detected
	httpClient *http.Client
	sseCancel  context.CancelFunc
}

// baseURL returns the base URL for a remote node (e.g. "https://host:8443").
func (rc *RemoteConn) baseURL() string {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	scheme := rc.scheme
	if scheme == "" {
		scheme = "https"
	}
	return scheme + "://" + rc.info.Address
}

// NewHub creates a new Hub.
func NewHub(database *sql.DB, broker *sse.Broker) *Hub {
	return &Hub{
		nodes:         make(map[string]*RemoteConn),
		db:            database,
		broker:        broker,
		newHTTPClient: defaultHTTPClient,
	}
}

// Start loads all remote nodes from the database and begins connecting to each.
func (h *Hub) Start(ctx context.Context) {
	h.ctx, h.cancel = context.WithCancel(ctx)

	nodes, err := db.ListRemoteNodes(h.db)
	if err != nil {
		log.Printf("[hub] failed to load remote nodes: %v", err)
		return
	}

	for _, n := range nodes {
		rc := &RemoteConn{
			info:       n,
			status:     "connecting",
			httpClient: h.newHTTPClient(),
		}
		h.mu.Lock()
		h.nodes[n.ID] = rc
		h.mu.Unlock()

		go h.connectNode(h.ctx, rc)
	}
}

// Stop cancels all connections and cleans up.
func (h *Hub) Stop() {
	if h.cancel != nil {
		h.cancel()
	}

	h.mu.Lock()
	for _, rc := range h.nodes {
		rc.mu.Lock()
		if rc.sseCancel != nil {
			rc.sseCancel()
		}
		rc.mu.Unlock()
	}
	h.mu.Unlock()
}

// AddNode registers a new remote node and starts connecting to it.
func (h *Hub) AddNode(ctx context.Context, address, apiKey, name string) (*NodeInfo, error) {
	// Validate by calling GET /api/status on the remote
	client := h.newHTTPClient()

	// First, authenticate to get a token (auto-detects HTTPS vs HTTP)
	loginRes, err := loginRemote(ctx, client, address, apiKey)
	if err != nil {
		return nil, fmt.Errorf("login to remote: %w", err)
	}

	// Validate the remote is reachable
	statusURL := fmt.Sprintf("%s://%s/api/status", loginRes.Scheme, address)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build status request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+loginRes.Token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("validate remote node: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("remote returned status %d", resp.StatusCode)
	}

	// Parse the status response to extract country
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read status response: %w", err)
	}

	var statusResp struct {
		Node struct {
			Country string `json:"country"`
		} `json:"node"`
	}
	_ = json.Unmarshal(body, &statusResp)

	id := generateID()
	now := time.Now().UTC().Format(time.RFC3339)

	node := &db.RemoteNode{
		ID:        id,
		Name:      name,
		Address:   address,
		APIKey:    apiKey,
		Status:    "connecting",
		Country:   statusResp.Node.Country,
		CreatedAt: now,
	}

	if err := db.CreateRemoteNode(h.db, node); err != nil {
		return nil, fmt.Errorf("save remote node: %w", err)
	}

	rc := &RemoteConn{
		info:       *node,
		status:     "connecting",
		token:      loginRes.Token,
		scheme:     loginRes.Scheme,
		httpClient: client,
	}

	h.mu.Lock()
	h.nodes[id] = rc
	h.mu.Unlock()

	go h.connectNode(h.ctx, rc)

	return h.buildNodeInfo(rc), nil
}

// RemoveNode disconnects and deletes a remote node.
func (h *Hub) RemoveNode(id string) error {
	h.mu.Lock()
	rc, ok := h.nodes[id]
	if ok {
		delete(h.nodes, id)
	}
	h.mu.Unlock()

	if !ok {
		return fmt.Errorf("node %s not found", id)
	}

	rc.mu.Lock()
	if rc.sseCancel != nil {
		rc.sseCancel()
	}
	rc.mu.Unlock()

	if err := db.DeleteRemoteNode(h.db, id); err != nil {
		return fmt.Errorf("delete remote node: %w", err)
	}

	return nil
}

// UpdateNode updates the name of a remote node.
func (h *Hub) UpdateNode(id, name string) error {
	h.mu.RLock()
	rc, ok := h.nodes[id]
	h.mu.RUnlock()

	if !ok {
		return fmt.Errorf("node %s not found", id)
	}

	if err := db.UpdateRemoteNodeName(h.db, id, name); err != nil {
		return fmt.Errorf("update remote node name: %w", err)
	}

	rc.mu.Lock()
	rc.info.Name = name
	rc.mu.Unlock()

	return nil
}

// ListNodes returns a snapshot of all remote nodes with their cached live data.
func (h *Hub) ListNodes() []NodeInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make([]NodeInfo, 0, len(h.nodes))
	for _, rc := range h.nodes {
		result = append(result, *h.buildNodeInfo(rc))
	}
	return result
}

// GetNode returns a single node's info.
func (h *Hub) GetNode(id string) (*NodeInfo, error) {
	h.mu.RLock()
	rc, ok := h.nodes[id]
	h.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("node %s not found", id)
	}

	return h.buildNodeInfo(rc), nil
}

// ProxyRequest forwards an HTTP request to a remote node and returns the response.
func (h *Hub) ProxyRequest(ctx context.Context, nodeID, method, path string, body io.Reader) (int, []byte, error) {
	h.mu.RLock()
	rc, ok := h.nodes[nodeID]
	h.mu.RUnlock()

	if !ok {
		return 0, nil, fmt.Errorf("node %s not found", nodeID)
	}

	rc.mu.RLock()
	token := rc.token
	address := rc.info.Address
	rcScheme := rc.scheme
	client := rc.httpClient
	rc.mu.RUnlock()

	scheme := rcScheme
	if scheme == "" {
		scheme = "https"
	}
	url := fmt.Sprintf("%s://%s%s", scheme, address, path)
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return 0, nil, fmt.Errorf("build proxy request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("proxy request: %w", err)
	}
	defer resp.Body.Close()

	// On 401, attempt token refresh and retry once
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if err := h.loginToRemote(ctx, rc); err != nil {
			return 0, nil, fmt.Errorf("re-auth failed: %w", err)
		}

		rc.mu.RLock()
		token = rc.token
		rc.mu.RUnlock()

		req2, err := http.NewRequestWithContext(ctx, method, url, body)
		if err != nil {
			return 0, nil, fmt.Errorf("build retry request: %w", err)
		}
		req2.Header.Set("Authorization", "Bearer "+token)
		req2.Header.Set("Content-Type", "application/json")

		resp2, err := client.Do(req2)
		if err != nil {
			return 0, nil, fmt.Errorf("retry proxy request: %w", err)
		}
		defer resp2.Body.Close()

		respBody, err := io.ReadAll(resp2.Body)
		if err != nil {
			return 0, nil, fmt.Errorf("read retry response: %w", err)
		}
		return resp2.StatusCode, respBody, nil
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, nil, fmt.Errorf("read proxy response: %w", err)
	}

	return resp.StatusCode, respBody, nil
}

// buildNodeInfo constructs a NodeInfo from a RemoteConn.
func (h *Hub) buildNodeInfo(rc *RemoteConn) *NodeInfo {
	rc.mu.RLock()
	defer rc.mu.RUnlock()

	info := &NodeInfo{
		ID:        rc.info.ID,
		Name:      rc.info.Name,
		Address:   rc.info.Address,
		Status:    rc.status,
		Country:   rc.info.Country,
		Latitude:  rc.latitude,
		Longitude: rc.longitude,
		CreatedAt: rc.info.CreatedAt,
	}

	if !rc.lastSeen.IsZero() {
		info.LastSeen = rc.lastSeen.Format(time.RFC3339)
	}

	if rc.metrics != nil {
		m := *rc.metrics
		info.Metrics = &m
	}

	if rc.containers != nil {
		info.Containers = make([]NodeContainer, len(rc.containers))
		copy(info.Containers, rc.containers)
	}

	return info
}

// generateID creates a short unique ID for a node.
func generateID() string {
	b := make([]byte, 8)
	_, _ = io.ReadFull(rand.Reader, b)
	return fmt.Sprintf("node-%x", b)
}
