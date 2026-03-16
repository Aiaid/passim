package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/node"
)

// NodeHub is the interface the API layer uses to interact with remote nodes.
// Implemented by *node.Hub.
type NodeHub interface {
	AddNode(ctx context.Context, address, apiKey, name string) (*node.NodeInfo, error)
	RemoveNode(id string) error
	UpdateNode(id, name string) error
	ListNodes() []node.NodeInfo
	GetNode(id string) (*node.NodeInfo, error)
	ProxyRequest(ctx context.Context, nodeID, method, path string, body io.Reader) (int, []byte, error)
}

type addNodeRequest struct {
	Address string `json:"address" binding:"required"`
	APIKey  string `json:"api_key" binding:"required"`
	Name    string `json:"name"`
}

type updateNodeRequest struct {
	Name string `json:"name" binding:"required"`
}

func addNodeHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		var req addNodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		info, err := deps.NodeHub.AddNode(c.Request.Context(), req.Address, req.APIKey, req.Name)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, info)
	}
}

func listNodesHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusOK, []node.NodeInfo{})
			return
		}

		nodes := deps.NodeHub.ListNodes()
		if nodes == nil {
			nodes = []node.NodeInfo{}
		}
		c.JSON(http.StatusOK, nodes)
	}
}

func deleteNodeHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		id := c.Param("id")
		if err := deps.NodeHub.RemoveNode(id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	}
}

func updateNodeHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		id := c.Param("id")
		var req updateNodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		if err := deps.NodeHub.UpdateNode(id, req.Name); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "updated"})
	}
}

// nodeProxyHandler forwards a request to a remote node via the hub.
func nodeProxyHandler(deps Deps, method string, pathFn func(c *gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		nodeID := c.Param("id")
		path := pathFn(c)
		status, body, err := deps.NodeHub.ProxyRequest(c.Request.Context(), nodeID, method, path, c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		c.Data(status, "application/json", body)
	}
}

type batchTarget struct {
	Target string `json:"target"`
	Status string `json:"status"`
	TaskID string `json:"task_id,omitempty"`
	Error  string `json:"error,omitempty"`
}

type batchDeployRequest struct {
	Template string                 `json:"template" binding:"required"`
	Settings map[string]interface{} `json:"settings"`
	Targets  []string               `json:"targets" binding:"required"`
}

type batchDeployResponse struct {
	Deployments []batchTarget `json:"deployments"`
}

func batchDeployHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req batchDeployRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		if len(req.Targets) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least one target required"})
			return
		}

		var results []batchTarget

		for _, target := range req.Targets {
			if target == "local" {
				result := batchTarget{Target: "local"}

				if deps.Templates == nil {
					result.Status = "failed"
					result.Error = "template registry not available"
					results = append(results, result)
					continue
				}

				_, ok := deps.Templates.Get(req.Template)
				if !ok {
					result.Status = "failed"
					result.Error = "template not found"
					results = append(results, result)
					continue
				}

				// Local deploy would go through the normal deploy flow.
				// For now, indicate it's been acknowledged for local processing.
				result.Status = "queued"
				results = append(results, result)
				continue
			}

			// Remote deploy: proxy to remote node
			if deps.NodeHub == nil {
				results = append(results, batchTarget{
					Target: target,
					Status: "failed",
					Error:  "node management not available",
				})
				continue
			}

			body, _ := json.Marshal(map[string]interface{}{
				"template": req.Template,
				"settings": req.Settings,
			})

			status, respBody, err := deps.NodeHub.ProxyRequest(
				c.Request.Context(), target, "POST", "/api/apps",
				bytes.NewReader(body),
			)
			if err != nil {
				results = append(results, batchTarget{
					Target: target,
					Status: "failed",
					Error:  err.Error(),
				})
				continue
			}

			result := batchTarget{Target: target}
			if status >= 200 && status < 300 {
				result.Status = "queued"
				// Try to extract task_id from response
				var resp struct {
					TaskID string `json:"task_id"`
				}
				if json.Unmarshal(respBody, &resp) == nil && resp.TaskID != "" {
					result.TaskID = resp.TaskID
				}
			} else {
				result.Status = "failed"
				var errResp struct {
					Error string `json:"error"`
				}
				if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != "" {
					result.Error = errResp.Error
				} else {
					result.Error = string(respBody)
				}
			}
			results = append(results, result)
		}

		c.JSON(http.StatusOK, batchDeployResponse{Deployments: results})
	}
}

func listConnectionsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Simplified: return empty list for now
		c.JSON(http.StatusOK, []interface{}{})
	}
}

func disconnectHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
	}
}

// ── Server-side speed test to a remote node ──────────────

type nodeSpeedtestResult struct {
	Download  float64 `json:"download"`  // Mbps
	Upload    float64 `json:"upload"`    // Mbps
	Latency   float64 `json:"latency"`   // ms
	Jitter    float64 `json:"jitter"`    // ms
	Timestamp string  `json:"timestamp"`
}

func nodeSpeedtestHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.NodeHub == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "node management not available"})
			return
		}

		nodeID := c.Param("id")
		ctx := c.Request.Context()

		// Phase 1: Download — fetch 10MB from remote, measure locally
		dlStart := time.Now()
		_, dlBody, err := deps.NodeHub.ProxyRequest(ctx, nodeID, "GET", "/api/speedtest/download?size=10mb", nil)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "download failed: " + err.Error()})
			return
		}
		dlDuration := time.Since(dlStart).Seconds()
		if dlDuration == 0 {
			dlDuration = 0.001
		}
		dlSpeed := float64(len(dlBody)*8) / (dlDuration * 1_000_000)

		// Phase 2: Upload — send 5MB to remote, measure locally
		uploadData := make([]byte, 5*1024*1024)
		rand.Read(uploadData)
		ulStart := time.Now()
		_, ulBody, err := deps.NodeHub.ProxyRequest(ctx, nodeID, "POST", "/api/speedtest/upload", bytes.NewReader(uploadData))
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "upload failed: " + err.Error()})
			return
		}
		ulDuration := time.Since(ulStart).Seconds()
		if ulDuration == 0 {
			ulDuration = 0.001
		}
		ulSpeed := float64(len(uploadData)*8) / (ulDuration * 1_000_000)
		// Also check remote's measurement, use the lower value
		var remoteUL struct {
			SpeedMbps float64 `json:"speed_mbps"`
		}
		if json.Unmarshal(ulBody, &remoteUL) == nil && remoteUL.SpeedMbps > 0 && remoteUL.SpeedMbps < ulSpeed {
			ulSpeed = remoteUL.SpeedMbps
		}

		// Phase 3: Latency & Jitter — 10 pings
		const pingCount = 10
		pings := make([]float64, 0, pingCount)
		for i := 0; i < pingCount; i++ {
			t0 := time.Now()
			_, _, err := deps.NodeHub.ProxyRequest(ctx, nodeID, "GET", "/api/speedtest/ping", nil)
			if err != nil {
				continue
			}
			pings = append(pings, float64(time.Since(t0).Microseconds()) / 1000.0)
		}

		var avgLatency, jitter float64
		if len(pings) > 0 {
			sum := 0.0
			for _, p := range pings {
				sum += p
			}
			avgLatency = sum / float64(len(pings))

			variance := 0.0
			for _, p := range pings {
				variance += (p - avgLatency) * (p - avgLatency)
			}
			jitter = math.Sqrt(variance / float64(len(pings)))
		}

		c.JSON(http.StatusOK, nodeSpeedtestResult{
			Download:  math.Round(dlSpeed*100) / 100,
			Upload:    math.Round(ulSpeed*100) / 100,
			Latency:   math.Round(avgLatency*10) / 10,
			Jitter:    math.Round(jitter*10) / 10,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}
}
