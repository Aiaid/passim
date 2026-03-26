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
	RxRate uint64 `json:"rx_rate"`
	TxRate uint64 `json:"tx_rate"`
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

// Cached public IPs and country (discovered lazily in background)
var (
	geoOnce sync.Once
	geoMu   sync.RWMutex
	geoData struct {
		ip   string
		ipv6 string
		cc   string
		lat  float64
		lon  float64
	}
)

func discoverGeo() {
	// IPv4
	ip, err := ssl.DiscoverPublicIP()
	if err != nil {
		ip = ""
	}

	// IPv6 (best-effort)
	ip6, err := ssl.DiscoverPublicIPv6()
	if err != nil {
		ip6 = ""
	}

	// Country lookup via IPv4 (or IPv6 fallback)
	lookupIP := ip
	if lookupIP == "" {
		lookupIP = ip6
	}

	var cc string
	var lat, lon float64

	if lookupIP != "" {
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get("http://ip-api.com/json/" + lookupIP + "?fields=countryCode,lat,lon")
		if err == nil {
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err == nil {
				var geo struct {
					CountryCode string  `json:"countryCode"`
					Lat         float64 `json:"lat"`
					Lon         float64 `json:"lon"`
				}
				if json.Unmarshal(body, &geo) == nil {
					cc = strings.ToUpper(geo.CountryCode)
					lat = geo.Lat
					lon = geo.Lon
				}
			}
		}
	}

	geoMu.Lock()
	geoData.ip = ip
	geoData.ipv6 = ip6
	geoData.cc = cc
	geoData.lat = lat
	geoData.lon = lon
	geoMu.Unlock()
}

func readGeo() (ip, ipv6, cc string, lat, lon float64) {
	geoMu.RLock()
	defer geoMu.RUnlock()
	return geoData.ip, geoData.ipv6, geoData.cc, geoData.lat, geoData.lon
}

func statusHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, err := metrics.Collect(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to collect metrics"})
			return
		}

		// Discover public IPs & country (lazy, once, in background)
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

		ip, ipv6, cc, lat, lon := readGeo()

		resp := statusResponse{
			Node: nodeInfo{
				ID:         nodeID,
				Name:       nodeName,
				Version:    version.Version,
				Uptime:     m.Uptime,
				PublicIP:   ip,
				PublicIPv6: ipv6,
				Country:    cc,
				Latitude:   lat,
				Longitude:  lon,
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
					RxRate: m.NetBytesRecv,
					TxRate: m.NetBytesSent,
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
