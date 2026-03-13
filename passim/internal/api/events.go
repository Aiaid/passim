package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func taskEventsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.SSE == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "SSE not available"})
			return
		}

		taskID := c.Param("id")

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		c.Status(http.StatusOK)
		c.Writer.Flush()

		topic := "task:" + taskID
		sub := deps.SSE.Subscribe(topic)
		defer deps.SSE.Unsubscribe(sub)

		for {
			select {
			case <-c.Request.Context().Done():
				return
			case event, ok := <-sub.Chan():
				if !ok {
					return
				}
				c.Writer.Write([]byte(event.Format()))
				c.Writer.Flush()
			}
		}
	}
}

func appEventsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if deps.SSE == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "SSE not available"})
			return
		}

		appID := c.Param("id")

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		c.Status(http.StatusOK)
		c.Writer.Flush()

		topic := "app:" + appID
		sub := deps.SSE.Subscribe(topic)
		defer deps.SSE.Unsubscribe(sub)

		for {
			select {
			case <-c.Request.Context().Done():
				return
			case event, ok := <-sub.Chan():
				if !ok {
					return
				}
				c.Writer.Write([]byte(event.Format()))
				c.Writer.Flush()
			}
		}
	}
}
