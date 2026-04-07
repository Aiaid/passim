package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/db"
	tmpl "github.com/passim/passim/internal/template"
)

// loadAppAndTemplateWithMetrics loads app + template, checks Metrics support.
func loadAppAndTemplateWithMetrics(deps Deps, c *gin.Context) (*db.App, *tmpl.Template, bool) {
	app, t, ok := loadAppAndTemplate(deps, c)
	if !ok {
		return nil, nil, false
	}
	if t.Metrics == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this template does not support traffic metrics"})
		return nil, nil, false
	}
	return app, t, true
}

type trafficNodeDetail struct {
	Node              string `json:"node"`
	TxBytes           int64  `json:"tx_bytes"`
	RxBytes           int64  `json:"rx_bytes"`
	OnlineConnections int    `json:"online_connections"`
}

type trafficUserSummary struct {
	Username          string              `json:"username"`
	TxBytes           int64               `json:"tx_bytes"`
	RxBytes           int64               `json:"rx_bytes"`
	OnlineConnections int                 `json:"online_connections"`
	Nodes             []trafficNodeDetail `json:"nodes,omitempty"`
}

type trafficResponse struct {
	Users  []trafficUserSummary `json:"users"`
	Total  trafficTotal         `json:"total"`
	Period string               `json:"period"`
}

type trafficTotal struct {
	TxBytes int64 `json:"tx_bytes"`
	RxBytes int64 `json:"rx_bytes"`
}

// parsePeriod converts a period string to a since time.
func parsePeriod(period string) time.Time {
	now := time.Now().UTC()
	switch period {
	case "1h":
		return now.Add(-1 * time.Hour)
	case "24h":
		return now.Add(-24 * time.Hour)
	case "7d":
		return now.Add(-7 * 24 * time.Hour)
	case "30d":
		return now.Add(-30 * 24 * time.Hour)
	case "all":
		return time.Time{} // zero time = all
	default:
		return now.Add(-24 * time.Hour) // default 24h
	}
}

func getTrafficHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, _, ok := loadAppAndTemplateWithMetrics(deps, c)
		if !ok {
			return
		}

		period := c.DefaultQuery("period", "24h")
		since := parsePeriod(period)

		summaries, err := db.GetTrafficSummary(deps.DB, app.ID, since)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Build user ID → username map
		users, _ := db.ListAppUsers(deps.DB, app.ID)
		idToUser := make(map[string]string)
		for _, u := range users {
			idToUser[u.ID] = u.Username
		}

		// Get online counts if available
		var onlineCounts map[string]int
		if deps.MetricsCollector != nil {
			onlineCounts = deps.MetricsCollector.GetOnline(app.ID)
		}

		// Local node name
		localName := localNodeName(deps)

		// Build per-user map with node details
		userMap := make(map[string]*trafficUserSummary)
		var totalTx, totalRx int64

		for _, s := range summaries {
			username := idToUser[s.UserID]
			if username == "" {
				username = s.UserID
			}
			online := 0
			if onlineCounts != nil {
				online = onlineCounts[username]
			}
			u := getOrCreateUser(userMap, username)
			u.TxBytes += s.TxBytes
			u.RxBytes += s.RxBytes
			u.OnlineConnections += online
			u.Nodes = append(u.Nodes, trafficNodeDetail{
				Node: localName, TxBytes: s.TxBytes, RxBytes: s.RxBytes, OnlineConnections: online,
			})
			totalTx += s.TxBytes
			totalRx += s.RxBytes
		}

		// Aggregate traffic from remote nodes running the same template
		remoteTraffic := fetchRemoteTraffic(c.Request.Context(), deps, app.Template, period)
		for _, rt := range remoteTraffic {
			u := getOrCreateUser(userMap, rt.Username)
			u.TxBytes += rt.TxBytes
			u.RxBytes += rt.RxBytes
			u.OnlineConnections += rt.OnlineConnections
			for _, nd := range rt.Nodes {
				u.Nodes = append(u.Nodes, nd)
			}
			// If remote didn't include node details, add a generic one
			if len(rt.Nodes) == 0 {
				u.Nodes = append(u.Nodes, trafficNodeDetail{
					Node: "remote", TxBytes: rt.TxBytes, RxBytes: rt.RxBytes, OnlineConnections: rt.OnlineConnections,
				})
			}
			totalTx += rt.TxBytes
			totalRx += rt.RxBytes
		}

		var userSummaries []trafficUserSummary
		for _, u := range userMap {
			userSummaries = append(userSummaries, *u)
		}

		if userSummaries == nil {
			userSummaries = []trafficUserSummary{}
		}

		c.JSON(http.StatusOK, trafficResponse{
			Users:  userSummaries,
			Total:  trafficTotal{TxBytes: totalTx, RxBytes: totalRx},
			Period: period,
		})
	}
}

type trafficHistoryPoint struct {
	Time string `json:"time"`
	Tx   int64  `json:"tx"`
	Rx   int64  `json:"rx"`
}

type trafficHistoryResponse struct {
	Points      []trafficHistoryPoint `json:"points"`
	Granularity string                `json:"granularity"`
}

// periodGranularity returns the DB granularity string for a given period.
func periodGranularity(period string) string {
	switch period {
	case "1h":
		return "5 minutes"
	case "24h":
		return "1 hour"
	case "7d":
		return "6 hours"
	case "30d":
		return "1 day"
	default:
		return "1 hour"
	}
}

func getUserTrafficHistoryHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		app, _, ok := loadAppAndTemplateWithMetrics(deps, c)
		if !ok {
			return
		}

		username := c.Param("username")
		period := c.DefaultQuery("period", "24h")
		since := parsePeriod(period)
		granularity := periodGranularity(period)

		// Verify the user exists. The traffic log rows are keyed by
		// username (see Doc/apps/hysteria.md schema), so we query by
		// username rather than user.ID.
		user, err := db.GetAppUserByUsername(deps.DB, app.ID, username)
		if err != nil || user == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		points, err := db.GetUserTrafficHistory(deps.DB, app.ID, user.Username, since, granularity)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		histPoints := make([]trafficHistoryPoint, 0, len(points))
		for _, p := range points {
			histPoints = append(histPoints, trafficHistoryPoint{
				Time: p.Time,
				Tx:   p.TxBytes,
				Rx:   p.RxBytes,
			})
		}

		c.JSON(http.StatusOK, trafficHistoryResponse{
			Points:      histPoints,
			Granularity: granularity,
		})
	}
}

func getOrCreateUser(m map[string]*trafficUserSummary, username string) *trafficUserSummary {
	if u, ok := m[username]; ok {
		return u
	}
	u := &trafficUserSummary{Username: username}
	m[username] = u
	return u
}

// fetchRemoteTraffic queries all connected remote nodes for traffic data
// of apps using the same template. Returns merged per-user summaries.
func fetchRemoteTraffic(ctx context.Context, deps Deps, templateName, period string) []trafficUserSummary {
	remoteApps := findRemoteApps(ctx, deps, templateName)
	if len(remoteApps) == 0 {
		return nil
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	var result []trafficUserSummary

	for _, ra := range remoteApps {
		wg.Add(1)
		go func(ra remoteAppInfo) {
			defer wg.Done()
			path := "/api/apps/" + ra.AppID + "/traffic?period=" + period
			status, body, err := deps.NodeHub.ProxyRequest(ctx, ra.NodeID, "GET", path, nil)
			if err != nil || status != http.StatusOK {
				return
			}
			var resp trafficResponse
			if json.Unmarshal(body, &resp) != nil {
				return
			}
			mu.Lock()
			result = append(result, resp.Users...)
			mu.Unlock()
		}(ra)
	}
	wg.Wait()
	return result
}
