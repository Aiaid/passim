package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"

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
