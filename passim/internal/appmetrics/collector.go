package appmetrics

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/template"
)

// Collector periodically polls app containers for traffic/online metrics
// and stores results in the database. It is driven entirely by template
// MetricsConfig — no app-specific logic.
type Collector struct {
	db        *sql.DB
	docker    docker.DockerClient
	templates *template.Registry
	client    *http.Client

	mu      sync.Mutex
	pollers map[string]context.CancelFunc // appID → cancel

	onlineMu sync.RWMutex
	online   map[string]map[string]int // appID → {username: connCount}
}

// NewCollector creates a new metrics collector.
func NewCollector(database *sql.DB, dockerClient docker.DockerClient, templates *template.Registry) *Collector {
	return &Collector{
		db:        database,
		docker:    dockerClient,
		templates: templates,
		client:    &http.Client{Timeout: 10 * time.Second},
		pollers:   make(map[string]context.CancelFunc),
		online:    make(map[string]map[string]int),
	}
}

// StartPolling starts a background goroutine that polls metrics for the given app
// at the interval specified by the template's MetricsConfig.
func (c *Collector) StartPolling(app *db.App, tmpl *template.Template) {
	if tmpl.Metrics == nil || tmpl.Metrics.PerUser == nil {
		return
	}

	interval := 60 * time.Second
	if tmpl.Metrics.Interval != "" {
		if d, err := time.ParseDuration(tmpl.Metrics.Interval); err == nil && d > 0 {
			interval = d
		}
	}

	c.mu.Lock()
	// Stop existing poller if any
	if cancel, ok := c.pollers[app.ID]; ok {
		cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.pollers[app.ID] = cancel
	c.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Poll once immediately
		c.pollOnce(ctx, app, tmpl)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.pollOnce(ctx, app, tmpl)
			}
		}
	}()
}

// StopPolling stops the metrics polling goroutine for the given app.
func (c *Collector) StopPolling(appID string) {
	c.mu.Lock()
	if cancel, ok := c.pollers[appID]; ok {
		cancel()
		delete(c.pollers, appID)
	}
	c.mu.Unlock()

	c.onlineMu.Lock()
	delete(c.online, appID)
	c.onlineMu.Unlock()
}

// StopAll stops all polling goroutines.
func (c *Collector) StopAll() {
	c.mu.Lock()
	for appID, cancel := range c.pollers {
		cancel()
		delete(c.pollers, appID)
	}
	c.mu.Unlock()

	c.onlineMu.Lock()
	c.online = make(map[string]map[string]int)
	c.onlineMu.Unlock()
}

// GetOnline returns a copy of the online user map for the given app.
// Returns nil if no data is available.
func (c *Collector) GetOnline(appID string) map[string]int {
	c.onlineMu.RLock()
	defer c.onlineMu.RUnlock()

	src, ok := c.online[appID]
	if !ok {
		return nil
	}
	// Return a copy
	out := make(map[string]int, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

// pollOnce performs a single metrics collection cycle for an app.
func (c *Collector) pollOnce(ctx context.Context, app *db.App, tmpl *template.Template) {
	if tmpl.Metrics == nil || tmpl.Metrics.PerUser == nil {
		return
	}

	perUser := tmpl.Metrics.PerUser
	if perUser.Method != "api" {
		return
	}

	if app.ContainerID == "" || c.docker == nil {
		return
	}

	// Get container IP via Docker inspect
	containerIP, err := c.getContainerIP(ctx, app.ContainerID)
	if err != nil {
		log.Printf("appmetrics: container IP for %s: %v", app.ID, err)
		return
	}

	// Resolve the secret from app.Generated
	secret := resolveSecret(perUser.Secret, app.Generated)

	// Poll traffic URL
	if perUser.URL != "" {
		trafficURL := resolveURL(perUser.URL, containerIP)
		if err := c.pollTraffic(ctx, app.ID, trafficURL, secret); err != nil {
			log.Printf("appmetrics: traffic poll %s: %v", app.ID, err)
		}
	}

	// Poll online URL
	if perUser.OnlineURL != "" {
		onlineURL := resolveURL(perUser.OnlineURL, containerIP)
		if err := c.pollOnlineStatus(ctx, app.ID, onlineURL, secret); err != nil {
			log.Printf("appmetrics: online poll %s: %v", app.ID, err)
		}
	}
}

// getContainerIP inspects the container and returns its IP address.
func (c *Collector) getContainerIP(ctx context.Context, containerID string) (string, error) {
	info, err := c.docker.InspectContainer(ctx, containerID)
	if err != nil {
		return "", fmt.Errorf("inspect container: %w", err)
	}

	if info.NetworkSettings != nil {
		// Try bridge network first
		if bridge, ok := info.NetworkSettings.Networks["bridge"]; ok && bridge.IPAddress != "" {
			return bridge.IPAddress, nil
		}
		// Fall back to first available network
		for _, net := range info.NetworkSettings.Networks {
			if net.IPAddress != "" {
				return net.IPAddress, nil
			}
		}
	}

	return "", fmt.Errorf("no IP address found for container %s", containerID)
}

// resolveSecret extracts the secret value from the template secret reference
// and the app's generated values. Secret format: "{{generated.stats_secret}}"
func resolveSecret(secretTmpl string, generatedJSON string) string {
	if secretTmpl == "" {
		return ""
	}

	// Extract key from {{generated.KEY}}
	trimmed := strings.TrimSpace(secretTmpl)
	if strings.HasPrefix(trimmed, "{{generated.") && strings.HasSuffix(trimmed, "}}") {
		key := strings.TrimSuffix(strings.TrimPrefix(trimmed, "{{generated."), "}}")
		var generated map[string]string
		if err := json.Unmarshal([]byte(generatedJSON), &generated); err == nil {
			if val, ok := generated[key]; ok {
				return val
			}
		}
	}

	return secretTmpl
}

// resolveURL replaces {{container.ip}} with the actual container IP.
func resolveURL(urlTmpl string, containerIP string) string {
	return strings.ReplaceAll(urlTmpl, "{{container.ip}}", containerIP)
}

// pollTraffic fetches traffic data from the container's traffic API endpoint.
// Expected response format: {"username": {"tx": 1234, "rx": 5678}, ...}
func (c *Collector) pollTraffic(ctx context.Context, appID, url, secret string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if secret != "" {
		req.Header.Set("Authorization", secret)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}

	// Parse: {"username": {"tx": N, "rx": N}, ...}
	var traffic map[string]struct {
		Tx int64 `json:"tx"`
		Rx int64 `json:"rx"`
	}
	if err := json.Unmarshal(body, &traffic); err != nil {
		return fmt.Errorf("parse traffic response: %w", err)
	}

	// Convert to TrafficLog entries and batch insert
	var logs []db.TrafficLog
	for username, data := range traffic {
		logs = append(logs, db.TrafficLog{
			AppID:   appID,
			UserID:  username,
			TxBytes: data.Tx,
			RxBytes: data.Rx,
		})
	}

	if len(logs) > 0 {
		if err := db.InsertTrafficLogs(c.db, logs); err != nil {
			return fmt.Errorf("insert traffic logs: %w", err)
		}
	}

	return nil
}

// pollOnlineStatus fetches online user data and caches it in memory.
// Expected response format: {"username": connCount, ...}
func (c *Collector) pollOnlineStatus(ctx context.Context, appID, url, secret string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if secret != "" {
		req.Header.Set("Authorization", secret)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}

	var onlineData map[string]int
	if err := json.Unmarshal(body, &onlineData); err != nil {
		return fmt.Errorf("parse online response: %w", err)
	}

	c.onlineMu.Lock()
	c.online[appID] = onlineData
	c.onlineMu.Unlock()

	return nil
}
