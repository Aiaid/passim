package db

import (
	"testing"
	"time"
)

func TestInsertTrafficLogs(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC().Format(time.RFC3339)
	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 1000, RxBytes: 2000, RecordedAt: now},
		{AppID: "app-001", UserID: "u-002", TxBytes: 500, RxBytes: 300, RecordedAt: now},
	}

	if err := InsertTrafficLogs(database, logs); err != nil {
		t.Fatal(err)
	}

	// Verify data was inserted
	var count int
	database.QueryRow("SELECT COUNT(*) FROM app_traffic_logs WHERE app_id = ?", "app-001").Scan(&count)
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

func TestInsertTrafficLogsSkipZero(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC().Format(time.RFC3339)
	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200, RecordedAt: now},
		{AppID: "app-001", UserID: "u-002", TxBytes: 0, RxBytes: 0, RecordedAt: now}, // should be skipped
		{AppID: "app-001", UserID: "u-003", TxBytes: 50, RxBytes: 0, RecordedAt: now}, // tx > 0, should insert
	}

	if err := InsertTrafficLogs(database, logs); err != nil {
		t.Fatal(err)
	}

	var count int
	database.QueryRow("SELECT COUNT(*) FROM app_traffic_logs").Scan(&count)
	if count != 2 {
		t.Errorf("count = %d, want 2 (zero entry skipped)", count)
	}
}

func TestInsertTrafficLogsEmpty(t *testing.T) {
	database := setupTestDB(t)

	if err := InsertTrafficLogs(database, nil); err != nil {
		t.Fatal(err)
	}
	if err := InsertTrafficLogs(database, []TrafficLog{}); err != nil {
		t.Fatal(err)
	}
}

func TestInsertTrafficLogsDefaultRecordedAt(t *testing.T) {
	database := setupTestDB(t)

	// RecordedAt empty should default to now
	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200},
	}

	if err := InsertTrafficLogs(database, logs); err != nil {
		t.Fatal(err)
	}

	var recordedAt string
	database.QueryRow("SELECT recorded_at FROM app_traffic_logs WHERE user_id = ?", "u-001").Scan(&recordedAt)
	if recordedAt == "" {
		t.Error("recorded_at should be set")
	}
}

func TestGetTrafficSummary(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC()
	recent := now.Add(-1 * time.Hour).Format(time.RFC3339)
	old := now.Add(-48 * time.Hour).Format(time.RFC3339)

	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200, RecordedAt: recent},
		{AppID: "app-001", UserID: "u-001", TxBytes: 50, RxBytes: 30, RecordedAt: recent},
		{AppID: "app-001", UserID: "u-002", TxBytes: 1000, RxBytes: 2000, RecordedAt: recent},
		{AppID: "app-001", UserID: "u-003", TxBytes: 999, RxBytes: 888, RecordedAt: old}, // outside 24h window
	}
	InsertTrafficLogs(database, logs)

	// Query last 24 hours
	since := now.Add(-24 * time.Hour)
	summaries, err := GetTrafficSummary(database, "app-001", since)
	if err != nil {
		t.Fatal(err)
	}

	if len(summaries) != 2 {
		t.Fatalf("len = %d, want 2 (u-003 outside window)", len(summaries))
	}

	// Find u-001
	var found bool
	for _, s := range summaries {
		if s.UserID == "u-001" {
			found = true
			if s.TxBytes != 150 {
				t.Errorf("u-001 tx = %d, want 150", s.TxBytes)
			}
			if s.RxBytes != 230 {
				t.Errorf("u-001 rx = %d, want 230", s.RxBytes)
			}
		}
	}
	if !found {
		t.Error("u-001 not in summary")
	}

	// Empty result for nonexistent app
	summaries, err = GetTrafficSummary(database, "app-999", since)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 0 {
		t.Errorf("len = %d, want 0", len(summaries))
	}
}

func TestGetUserTrafficHistory(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC()
	// Insert data points at different hours
	t1 := now.Add(-3 * time.Hour).Format(time.RFC3339)
	t2 := now.Add(-2 * time.Hour).Format(time.RFC3339)
	t3 := now.Add(-1 * time.Hour).Format(time.RFC3339)

	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200, RecordedAt: t1},
		{AppID: "app-001", UserID: "u-001", TxBytes: 50, RxBytes: 30, RecordedAt: t1},
		{AppID: "app-001", UserID: "u-001", TxBytes: 300, RxBytes: 400, RecordedAt: t2},
		{AppID: "app-001", UserID: "u-001", TxBytes: 500, RxBytes: 600, RecordedAt: t3},
	}
	InsertTrafficLogs(database, logs)

	since := now.Add(-24 * time.Hour)
	points, err := GetUserTrafficHistory(database, "app-001", "u-001", since, "1 hour")
	if err != nil {
		t.Fatal(err)
	}

	if len(points) != 3 {
		t.Fatalf("len = %d, want 3 buckets", len(points))
	}

	// First bucket should have aggregated t1 entries
	if points[0].TxBytes != 150 {
		t.Errorf("bucket[0] tx = %d, want 150", points[0].TxBytes)
	}
	if points[0].RxBytes != 230 {
		t.Errorf("bucket[0] rx = %d, want 230", points[0].RxBytes)
	}

	// Empty result
	points, err = GetUserTrafficHistory(database, "app-001", "u-999", since, "1 hour")
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 0 {
		t.Errorf("len = %d, want 0", len(points))
	}
}

func TestGetUserTrafficHistoryDayGranularity(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC()
	t1 := now.Add(-2 * time.Hour).Format(time.RFC3339)
	t2 := now.Add(-1 * time.Hour).Format(time.RFC3339)

	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200, RecordedAt: t1},
		{AppID: "app-001", UserID: "u-001", TxBytes: 300, RxBytes: 400, RecordedAt: t2},
	}
	InsertTrafficLogs(database, logs)

	since := now.Add(-24 * time.Hour)
	points, err := GetUserTrafficHistory(database, "app-001", "u-001", since, "1 day")
	if err != nil {
		t.Fatal(err)
	}

	// Both entries should be in the same day bucket
	if len(points) != 1 {
		t.Fatalf("len = %d, want 1 (same day)", len(points))
	}
	if points[0].TxBytes != 400 {
		t.Errorf("tx = %d, want 400", points[0].TxBytes)
	}
}

func TestGetTotalTrafficByUser(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC()
	logs := []TrafficLog{
		{AppID: "app-001", UserID: "u-001", TxBytes: 100, RxBytes: 200, RecordedAt: now.Add(-48 * time.Hour).Format(time.RFC3339)},
		{AppID: "app-001", UserID: "u-001", TxBytes: 300, RxBytes: 400, RecordedAt: now.Add(-1 * time.Hour).Format(time.RFC3339)},
		{AppID: "app-001", UserID: "u-002", TxBytes: 999, RxBytes: 888, RecordedAt: now.Format(time.RFC3339)},
	}
	InsertTrafficLogs(database, logs)

	total, err := GetTotalTrafficByUser(database, "app-001", "u-001")
	if err != nil {
		t.Fatal(err)
	}
	// (100+200) + (300+400) = 1000
	if total != 1000 {
		t.Errorf("total = %d, want 1000", total)
	}

	// No traffic for nonexistent user
	total, err = GetTotalTrafficByUser(database, "app-001", "u-999")
	if err != nil {
		t.Fatal(err)
	}
	if total != 0 {
		t.Errorf("total = %d, want 0", total)
	}
}

func TestBatchInsertLargeSet(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC().Format(time.RFC3339)
	var logs []TrafficLog
	for i := 0; i < 100; i++ {
		logs = append(logs, TrafficLog{
			AppID: "app-001", UserID: "u-001", TxBytes: 10, RxBytes: 20, RecordedAt: now,
		})
	}

	if err := InsertTrafficLogs(database, logs); err != nil {
		t.Fatal(err)
	}

	total, _ := GetTotalTrafficByUser(database, "app-001", "u-001")
	// 100 * (10+20) = 3000
	if total != 3000 {
		t.Errorf("total = %d, want 3000", total)
	}
}
