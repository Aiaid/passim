package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/metrics"
	"github.com/passim/passim/internal/sse"
)

func metricsStreamHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		c.Status(http.StatusOK)
		c.Writer.Flush()

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		// Send initial metrics immediately
		sendMetrics(c.Writer)
		c.Writer.Flush()

		for {
			select {
			case <-c.Request.Context().Done():
				return
			case <-ticker.C:
				sendMetrics(c.Writer)
				c.Writer.Flush()
			}
		}
	}
}

func sendMetrics(w io.Writer) {
	m, err := metrics.Collect(context.Background())
	if err != nil {
		return
	}
	data, _ := json.Marshal(m)
	event := sse.Event{Type: "metrics", Data: string(data)}
	w.Write([]byte(event.Format()))
}
