package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/metrics"
)

type statusResponse struct {
	Node       nodeInfo       `json:"node"`
	System     systemInfo     `json:"system"`
	Containers containersSummary `json:"containers"`
}

type nodeInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Uptime  uint64 `json:"uptime"`
}

type cpuInfo struct {
	UsagePercent float64 `json:"usage_percent"`
	Cores        int     `json:"cores"`
	Model        string  `json:"model"`
}

type memoryInfo struct {
	TotalBytes   uint64  `json:"total_bytes"`
	UsedBytes    uint64  `json:"used_bytes"`
	UsagePercent float64 `json:"usage_percent"`
}

type diskInfo struct {
	TotalBytes   uint64  `json:"total_bytes"`
	UsedBytes    uint64  `json:"used_bytes"`
	UsagePercent float64 `json:"usage_percent"`
}

type networkInfo struct {
	RxBytes uint64 `json:"rx_bytes"`
	TxBytes uint64 `json:"tx_bytes"`
}

type loadInfo struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type systemInfo struct {
	CPU     cpuInfo     `json:"cpu"`
	Memory  memoryInfo  `json:"memory"`
	Disk    diskInfo    `json:"disk"`
	Network networkInfo `json:"network"`
	Load    loadInfo    `json:"load"`
	OS      string      `json:"os"`
	Kernel  string      `json:"kernel"`
}

type containersSummary struct {
	Running int `json:"running"`
	Stopped int `json:"stopped"`
	Total   int `json:"total"`
}

func statusHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, err := metrics.Collect(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to collect metrics"})
			return
		}

		// Get node info from DB (best effort)
		nodeID, _ := db.GetConfig(deps.DB, "node_id")
		nodeName, err := db.GetConfig(deps.DB, "node_name")
		if err == sql.ErrNoRows || nodeName == "" {
			nodeName = m.Hostname
		}

		// Container summary (Docker may be unavailable)
		var cs containersSummary
		if deps.Docker != nil {
			containers, err := deps.Docker.ListContainers(c.Request.Context())
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

		resp := statusResponse{
			Node: nodeInfo{
				ID:      nodeID,
				Name:    nodeName,
				Version: "0.1.0",
				Uptime:  m.Uptime,
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

		c.JSON(http.StatusOK, resp)
	}
}
