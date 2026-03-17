package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/metrics"
	"github.com/passim/passim/internal/node"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/version"
)

// metricsCache stores the latest metrics to avoid redundant collection.
type metricsCache struct {
	mu     sync.RWMutex
	latest *metrics.SystemMetrics
}

func (mc *metricsCache) Get() *metrics.SystemMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	return mc.latest
}

func (mc *metricsCache) Set(m *metrics.SystemMetrics) {
	mc.mu.Lock()
	mc.latest = m
	mc.mu.Unlock()
}

func unifiedStreamHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		// SSE headers
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		// Disable write deadline for this long-lived SSE connection
		rc := http.NewResponseController(c.Writer)
		_ = rc.SetWriteDeadline(time.Time{})

		c.Status(http.StatusOK)
		c.Writer.Flush()

		ctx := c.Request.Context()
		var mu sync.Mutex // serialize writes to ResponseWriter

		writeEvent := func(event sse.Event) {
			mu.Lock()
			defer mu.Unlock()
			c.Writer.Write([]byte(event.Format()))
			c.Writer.Flush()
		}

		cache := &metricsCache{}

		// --- Initial snapshot ---
		sendInitialSnapshot(ctx, deps, cache, writeEvent)

		// --- Subscribe to broker for real-time events ---
		var brokerSub *sse.Subscriber
		if deps.SSE != nil {
			brokerSub = deps.SSE.SubscribeAll()
		}

		// --- Start periodic goroutines ---
		done := make(chan struct{})
		var wg sync.WaitGroup

		// Goroutine: Metrics (5s)
		wg.Add(1)
		go func() {
			defer wg.Done()
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					m, err := metrics.Collect(ctx)
					if err != nil {
						continue
					}
					cache.Set(m)
					data, _ := json.Marshal(m)
					writeEvent(sse.Event{Type: "metrics", Data: string(data)})
				}
			}
		}()

		// Goroutine: Status (30s)
		wg.Add(1)
		go func() {
			defer wg.Done()
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					resp := buildStatusResponse(ctx, deps, cache)
					data, _ := json.Marshal(resp)
					writeEvent(sse.Event{Type: "status", Data: string(data)})
				}
			}
		}()

		// Goroutine: Containers (10s)
		wg.Add(1)
		go func() {
			defer wg.Done()
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					data := collectContainersJSON(ctx, deps)
					if data != nil {
						writeEvent(sse.Event{Type: "containers", Data: string(data)})
					}
				}
			}
		}()

		// Goroutine: Apps (15s)
		wg.Add(1)
		go func() {
			defer wg.Done()
			ticker := time.NewTicker(15 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					data := collectAppsJSON(deps.DB)
					if data != nil {
						writeEvent(sse.Event{Type: "apps", Data: string(data)})
					}
				}
			}
		}()

		// Goroutine: Nodes (10s) — only if NodeHub is available
		if deps.NodeHub != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				// Send initial snapshot
				nodes := deps.NodeHub.ListNodes()
				if nodes == nil {
					nodes = []node.NodeInfo{}
				}
				data, _ := json.Marshal(nodes)
				writeEvent(sse.Event{Type: "nodes", Data: string(data)})

				ticker := time.NewTicker(10 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-done:
						return
					case <-ticker.C:
						nodes := deps.NodeHub.ListNodes()
						if nodes == nil {
							nodes = []node.NodeInfo{}
						}
						data, _ := json.Marshal(nodes)
						writeEvent(sse.Event{Type: "nodes", Data: string(data)})
					}
				}
			}()
		}

		// Goroutine: Broker forwarder
		if brokerSub != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for {
					select {
					case <-done:
						return
					case event, ok := <-brokerSub.Chan():
						if !ok {
							return
						}
						// Forward broker events: use topic as SSE event name,
						// wrap original type + data in the payload.
						wrapped := fmt.Sprintf(`{"type":%q,"data":%s}`, event.Type, event.Data)
						writeEvent(sse.Event{Type: event.Topic, Data: wrapped})
					}
				}
			}()
		}

		// Wait for client disconnect
		<-ctx.Done()

		// Cleanup
		close(done)
		if brokerSub != nil {
			deps.SSE.Unsubscribe(brokerSub)
		}
		wg.Wait()
	}
}

// sendInitialSnapshot sends one event of each type immediately on connect.
func sendInitialSnapshot(ctx context.Context, deps Deps, cache *metricsCache, writeEvent func(sse.Event)) {
	// Metrics (blocking ~1s due to CPU sampling)
	m, err := metrics.Collect(ctx)
	if err == nil {
		cache.Set(m)
		data, _ := json.Marshal(m)
		writeEvent(sse.Event{Type: "metrics", Data: string(data)})
	}

	// Status (reuses cached metrics)
	resp := buildStatusResponse(ctx, deps, cache)
	statusData, _ := json.Marshal(resp)
	writeEvent(sse.Event{Type: "status", Data: string(statusData)})

	// Containers
	if cData := collectContainersJSON(ctx, deps); cData != nil {
		writeEvent(sse.Event{Type: "containers", Data: string(cData)})
	}

	// Apps
	if aData := collectAppsJSON(deps.DB); aData != nil {
		writeEvent(sse.Event{Type: "apps", Data: string(aData)})
	}

	// Nodes
	if deps.NodeHub != nil {
		nodes := deps.NodeHub.ListNodes()
		if nodes == nil {
			nodes = []node.NodeInfo{}
		}
		nData, _ := json.Marshal(nodes)
		writeEvent(sse.Event{Type: "nodes", Data: string(nData)})
	}
}

// buildStatusResponse assembles the status response, reusing cached metrics.
func buildStatusResponse(ctx context.Context, deps Deps, cache *metricsCache) statusResponse {
	m := cache.Get()
	if m == nil {
		// Fallback: collect fresh if cache is empty
		var err error
		m, err = metrics.Collect(ctx)
		if err != nil {
			m = &metrics.SystemMetrics{}
		}
		cache.Set(m)
	}

	// Discover geo (lazy, once)
	geoOnce.Do(func() { go discoverGeo() })

	nodeID, _ := db.GetConfig(deps.DB, "node_id")
	nodeName, err := db.GetConfig(deps.DB, "node_name")
	if err == sql.ErrNoRows || nodeName == "" {
		nodeName = m.Hostname
	}

	var cs containersSummary
	if deps.Docker != nil {
		containers, err := deps.Docker.ListContainers(ctx)
		if err == nil {
			cs.Total = len(containers)
			for _, ct := range containers {
				if ct.State == "running" {
					cs.Running++
				} else {
					cs.Stopped++
				}
			}
		}
	}

	return statusResponse{
		Node: nodeInfo{
			ID:         nodeID,
			Name:       nodeName,
			Version:    version.Version,
			Uptime:     m.Uptime,
			PublicIP:   cachedIP,
			PublicIPv6: cachedIPv6,
			Country:    cachedCC,
			Latitude:   cachedLat,
			Longitude:  cachedLon,
		},
		System: systemInfo{
			CPU: cpuInfo{
				UsagePercent: m.CPUPercent,
				Cores:        m.CPUCores,
				Model:        m.CPUModel,
			},
			Memory: memoryInfo{
				TotalBytes:   m.MemTotal,
				UsedBytes:    m.MemUsed,
				UsagePercent: m.MemPercent,
			},
			Disk: diskInfo{
				TotalBytes:   m.DiskTotal,
				UsedBytes:    m.DiskUsed,
				UsagePercent: m.DiskPercent,
			},
			Network: networkInfo{
				RxBytes: m.NetBytesRecv,
				TxBytes: m.NetBytesSent,
			},
			Load: loadInfo{
				Load1:  m.Load1,
				Load5:  m.Load5,
				Load15: m.Load15,
			},
			OS:     m.OS,
			Kernel: m.Kernel,
		},
		Containers: cs,
	}
}

// collectContainersJSON returns the container list as JSON bytes.
func collectContainersJSON(ctx context.Context, deps Deps) []byte {
	if deps.Docker == nil {
		return nil
	}
	containers, err := deps.Docker.ListContainers(ctx)
	if err != nil {
		return nil
	}
	data, _ := json.Marshal(containers)
	return data
}

// collectAppsJSON returns the app list as JSON bytes.
func collectAppsJSON(database *sql.DB) []byte {
	apps, err := db.ListApps(database)
	if err != nil {
		return nil
	}
	var resp []appResponse
	for _, a := range apps {
		var settings map[string]interface{}
		json.Unmarshal([]byte(a.Settings), &settings)
		resp = append(resp, appResponse{
			ID:          a.ID,
			Template:    a.Template,
			Settings:    settings,
			Status:      a.Status,
			ContainerID: a.ContainerID,
			DeployedAt:  a.DeployedAt,
			UpdatedAt:   a.UpdatedAt,
		})
	}
	if resp == nil {
		resp = []appResponse{}
	}
	data, _ := json.Marshal(resp)
	return data
}
