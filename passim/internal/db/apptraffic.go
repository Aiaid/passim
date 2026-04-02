package db

import (
	"database/sql"
	"fmt"
	"time"
)

// TrafficLog represents a single traffic sample for a user.
type TrafficLog struct {
	AppID      string `json:"app_id"`
	UserID     string `json:"user_id"`
	TxBytes    int64  `json:"tx_bytes"`
	RxBytes    int64  `json:"rx_bytes"`
	RecordedAt string `json:"recorded_at"`
}

// TrafficSummary holds aggregated traffic for one user.
type TrafficSummary struct {
	UserID  string `json:"user_id"`
	TxBytes int64  `json:"tx_bytes"`
	RxBytes int64  `json:"rx_bytes"`
}

// TrafficPoint represents a single time-bucketed data point.
type TrafficPoint struct {
	Time    string `json:"time"`
	TxBytes int64  `json:"tx_bytes"`
	RxBytes int64  `json:"rx_bytes"`
}

// InsertTrafficLogs batch-inserts traffic logs within a transaction.
// Entries with both tx_bytes and rx_bytes equal to zero are skipped.
func InsertTrafficLogs(database *sql.DB, logs []TrafficLog) error {
	if len(logs) == 0 {
		return nil
	}

	tx, err := database.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(
		`INSERT INTO app_traffic_logs (app_id, user_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	now := time.Now().UTC().Format(time.RFC3339)
	for _, l := range logs {
		if l.TxBytes == 0 && l.RxBytes == 0 {
			continue
		}
		recordedAt := l.RecordedAt
		if recordedAt == "" {
			recordedAt = now
		}
		if _, err := stmt.Exec(l.AppID, l.UserID, l.TxBytes, l.RxBytes, recordedAt); err != nil {
			return fmt.Errorf("insert traffic log: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// GetTrafficSummary returns aggregated tx/rx per user for a given app within a time range.
func GetTrafficSummary(database *sql.DB, appID string, since time.Time) ([]TrafficSummary, error) {
	rows, err := database.Query(
		`SELECT user_id, SUM(tx_bytes), SUM(rx_bytes)
		 FROM app_traffic_logs
		 WHERE app_id = ? AND recorded_at >= ?
		 GROUP BY user_id`,
		appID, since.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return nil, fmt.Errorf("get traffic summary: %w", err)
	}
	defer rows.Close()

	var summaries []TrafficSummary
	for rows.Next() {
		var s TrafficSummary
		if err := rows.Scan(&s.UserID, &s.TxBytes, &s.RxBytes); err != nil {
			return nil, fmt.Errorf("scan traffic summary: %w", err)
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}

// GetUserTrafficHistory returns time-bucketed traffic points for a single user.
// The granularity parameter controls the time bucket size (e.g. "1 hour", "1 day").
func GetUserTrafficHistory(database *sql.DB, appID, userID string, since time.Time, granularity string) ([]TrafficPoint, error) {
	// SQLite strftime format for bucketing
	var timeFmt string
	switch granularity {
	case "1 hour":
		timeFmt = "%Y-%m-%dT%H:00:00Z"
	case "1 day":
		timeFmt = "%Y-%m-%dT00:00:00Z"
	default:
		timeFmt = "%Y-%m-%dT%H:00:00Z"
	}

	rows, err := database.Query(
		fmt.Sprintf(
			`SELECT strftime('%s', recorded_at) AS bucket, SUM(tx_bytes), SUM(rx_bytes)
			 FROM app_traffic_logs
			 WHERE app_id = ? AND user_id = ? AND recorded_at >= ?
			 GROUP BY bucket
			 ORDER BY bucket`, timeFmt),
		appID, userID, since.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return nil, fmt.Errorf("get user traffic history: %w", err)
	}
	defer rows.Close()

	var points []TrafficPoint
	for rows.Next() {
		var p TrafficPoint
		if err := rows.Scan(&p.Time, &p.TxBytes, &p.RxBytes); err != nil {
			return nil, fmt.Errorf("scan traffic point: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetTotalTrafficByUser returns the all-time total tx+rx bytes for a user in an app (for quota checking).
func GetTotalTrafficByUser(database *sql.DB, appID, userID string) (int64, error) {
	var total int64
	err := database.QueryRow(
		`SELECT COALESCE(SUM(tx_bytes + rx_bytes), 0)
		 FROM app_traffic_logs
		 WHERE app_id = ? AND user_id = ?`,
		appID, userID,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("get total traffic by user: %w", err)
	}
	return total, nil
}
