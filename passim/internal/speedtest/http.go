package speedtest

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultDownloadSize = 100 * 1024 * 1024 // 100MB
	chunkSize           = 64 * 1024         // 64KB
)

// DownloadHandler serves random bytes for download speed testing.
// Query parameter: ?size=100mb (default 100MB)
func DownloadHandler(c *gin.Context) {
	size := defaultDownloadSize
	if sizeParam := c.Query("size"); sizeParam != "" {
		parsed, err := parseSize(sizeParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid size: %s", err)})
			return
		}
		size = parsed
	}

	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.Itoa(size))
	c.Header("Content-Disposition", "attachment; filename=speedtest.bin")
	c.Header("Cache-Control", "no-store")
	c.Status(http.StatusOK)

	buf := make([]byte, chunkSize)
	remaining := size
	for remaining > 0 {
		n := chunkSize
		if remaining < n {
			n = remaining
		}
		// Use crypto/rand for random bytes
		if _, err := rand.Read(buf[:n]); err != nil {
			return
		}
		if _, err := c.Writer.Write(buf[:n]); err != nil {
			return
		}
		c.Writer.Flush()
		remaining -= n
	}
}

// UploadResult is the JSON response from the upload speed test.
type UploadResult struct {
	Bytes      int64   `json:"bytes"`
	DurationMs int64   `json:"duration_ms"`
	SpeedMbps  float64 `json:"speed_mbps"`
}

// UploadHandler reads the request body and measures upload speed.
func UploadHandler(c *gin.Context) {
	start := time.Now()

	buf := make([]byte, chunkSize)
	var total int64
	for {
		n, err := c.Request.Body.Read(buf)
		total += int64(n)
		if err != nil {
			break
		}
	}

	duration := time.Since(start)
	durationMs := duration.Milliseconds()
	if durationMs == 0 {
		durationMs = 1
	}

	speedMbps := float64(total*8) / (float64(duration.Seconds()) * 1_000_000)

	c.JSON(http.StatusOK, UploadResult{
		Bytes:      total,
		DurationMs: durationMs,
		SpeedMbps:  speedMbps,
	})
}

// PingResult is the JSON response from the ping endpoint.
type PingResult struct {
	Timestamp string `json:"timestamp"`
}

// PingHandler returns the current server timestamp.
func PingHandler(c *gin.Context) {
	c.JSON(http.StatusOK, PingResult{
		Timestamp: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	})
}

// parseSize parses a human-readable size string like "100mb", "10MB", "1gb".
func parseSize(s string) (int, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return 0, fmt.Errorf("empty size")
	}

	var numStr, unit string
	for i, c := range s {
		if c < '0' || c > '9' {
			numStr = s[:i]
			unit = s[i:]
			break
		}
	}
	if numStr == "" {
		// All digits, treat as bytes
		n, err := strconv.Atoi(s)
		if err != nil {
			return 0, fmt.Errorf("invalid number: %s", s)
		}
		return n, nil
	}

	n, err := strconv.Atoi(numStr)
	if err != nil {
		return 0, fmt.Errorf("invalid number: %s", numStr)
	}

	switch unit {
	case "b", "":
		return n, nil
	case "kb":
		return n * 1024, nil
	case "mb":
		return n * 1024 * 1024, nil
	case "gb":
		return n * 1024 * 1024 * 1024, nil
	default:
		return 0, fmt.Errorf("unknown unit: %s", unit)
	}
}
