package api

import (
	"net/http"
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

type trafficUserSummary struct {
	Username          string `json:"username"`
	TxBytes           int64  `json:"tx_bytes"`
	RxBytes           int64  `json:"rx_bytes"`
	OnlineConnections int    `json:"online_connections"`
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

		var totalTx, totalRx int64
		var userSummaries []trafficUserSummary
		for _, s := range summaries {
			username := idToUser[s.UserID]
			if username == "" {
				username = s.UserID
			}
			online := 0
			if onlineCounts != nil {
				online = onlineCounts[username]
			}
			userSummaries = append(userSummaries, trafficUserSummary{
				Username:          username,
				TxBytes:           s.TxBytes,
				RxBytes:           s.RxBytes,
				OnlineConnections: online,
			})
			totalTx += s.TxBytes
			totalRx += s.RxBytes
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

		// Look up user ID from username
		user, err := db.GetAppUserByUsername(deps.DB, app.ID, username)
		if err != nil || user == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		points, err := db.GetUserTrafficHistory(deps.DB, app.ID, user.ID, since, granularity)
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
