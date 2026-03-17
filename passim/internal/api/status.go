package api

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/metrics"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/version"
)

type statusResponse struct {
	Node       nodeInfo         `json:"node"`
	System     systemInfo       `json:"system"`
	Containers containersSummary `json:"containers"`
}

type nodeInfo struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Version    string  `json:"version"`
	Uptime     uint64  `json:"uptime"`
	PublicIP   string  `json:"public_ip,omitempty"`
	PublicIPv6 string  `json:"public_ip6,omitempty"`
	Country    string  `json:"country,omitempty"`
	Latitude   float64 `json:"latitude,omitempty"`
	Longitude  float64 `json:"longitude,omitempty"`
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

// Cached public IPs and country (discovered lazily, once)
var (
	geoOnce    sync.Once
	cachedIP   string
	cachedIPv6 string
	cachedCC   string
	cachedLat  float64
	cachedLon  float64
)

func discoverGeo() {
	// IPv4
	ip, err := ssl.DiscoverPublicIP()
	if err == nil {
		cachedIP = ip
	}

	// IPv6 (best-effort)
	ip6, err := ssl.DiscoverPublicIPv6()
	if err == nil {
		cachedIPv6 = ip6
	}

	// Country lookup via IPv4 (or IPv6 fallback)
	lookupIP := cachedIP
	if lookupIP == "" {
		lookupIP = cachedIPv6
	}
	if lookupIP == "" {
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://ip-api.com/json/" + lookupIP + "?fields=countryCode,lat,lon")
	if err != nil {
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}
	var geo struct {
		CountryCode string  `json:"countryCode"`
		Lat         float64 `json:"lat"`
		Lon         float64 `json:"lon"`
	}
	if json.Unmarshal(body, &geo) == nil {
		cachedCC = strings.ToUpper(geo.CountryCode)
		cachedLat = geo.Lat
		cachedLon = geo.Lon
	}
}

func statusHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, err := metrics.Collect(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to collect metrics"})
			return
		}

		// Discover public IPs & country (lazy, once)
		geoOnce.Do(func() { go discoverGeo() })

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

		c.JSON(http.StatusOK, resp)
	}
}
