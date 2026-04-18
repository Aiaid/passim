package api

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/docker/docker/pkg/stdcopy"
	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/sse"
)

func requireDocker(deps Deps, c *gin.Context) bool {
	if deps.Docker == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "docker is not available"})
		return false
	}
	return true
}

// notifyRefresh sends a refresh signal to trigger immediate SSE updates.
func notifyRefresh(deps Deps, topics ...string) {
	if deps.SSE == nil {
		return
	}
	for _, topic := range topics {
		deps.SSE.Publish(sse.Event{Topic: topic})
	}
}

func listContainersHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		containers, err := deps.Docker.ListContainers(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list containers"})
			return
		}

		c.JSON(http.StatusOK, containers)
	}
}

func startContainerHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		if err := deps.Docker.StartContainer(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start container"})
			return
		}

		notifyRefresh(deps, "_:containers")
		c.JSON(http.StatusOK, gin.H{"status": "started"})
	}
}

func stopContainerHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		if err := deps.Docker.StopContainer(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to stop container"})
			return
		}

		notifyRefresh(deps, "_:containers")
		c.JSON(http.StatusOK, gin.H{"status": "stopped"})
	}
}

func restartContainerHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		if err := deps.Docker.RestartContainer(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to restart container"})
			return
		}

		notifyRefresh(deps, "_:containers")
		c.JSON(http.StatusOK, gin.H{"status": "restarted"})
	}
}

func removeContainerHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		if err := deps.Docker.RemoveContainer(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove container"})
			return
		}

		notifyRefresh(deps, "_:containers")
		c.JSON(http.StatusOK, gin.H{"status": "removed"})
	}
}

func containerLogsHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		lines := 200
		if q := c.Query("lines"); q != "" {
			if n, err := strconv.Atoi(q); err == nil && n > 0 {
				lines = n
			}
		}

		if follow := c.Query("follow"); follow == "1" || follow == "true" {
			streamContainerLogs(deps, c, id, lines)
			return
		}

		reader, err := deps.Docker.ContainerLogs(c.Request.Context(), id, lines)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get container logs"})
			return
		}
		defer reader.Close()

		raw, err := io.ReadAll(reader)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read container logs"})
			return
		}

		// Docker multiplexed stream has 8-byte headers per frame; demux them.
		// TTY containers produce plain text — fallback to raw if demux yields nothing.
		var buf bytes.Buffer
		_, demuxErr := stdcopy.StdCopy(&buf, &buf, bytes.NewReader(raw))
		if demuxErr != nil || (buf.Len() == 0 && len(raw) > 0) {
			c.JSON(http.StatusOK, gin.H{"logs": string(raw)})
			return
		}

		c.JSON(http.StatusOK, gin.H{"logs": buf.String()})
	}
}

// sseKeepaliveInterval is how often an SSE comment is emitted on an idle
// stream to keep proxies from closing the connection. Exported as a var so
// tests can shrink it.
var sseKeepaliveInterval = 20 * time.Second

// streamContainerLogs pushes container logs as an SSE stream.
// Each chunk is emitted as `event: log` with base64-encoded data so that
// newlines, ANSI escapes, and other control bytes survive transport intact.
func streamContainerLogs(deps Deps, c *gin.Context, id string, lines int) {
	// Detect TTY mode: multiplexed streams only exist for non-TTY containers.
	tty := false
	if inspect, err := deps.Docker.InspectContainer(c.Request.Context(), id); err == nil {
		if inspect.Config != nil {
			tty = inspect.Config.Tty
		}
	}

	reader, err := deps.Docker.ContainerLogsFollow(c.Request.Context(), id, lines)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get container logs"})
		return
	}
	defer reader.Close()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	w := &sseLogWriter{w: c.Writer}

	// Idle keepalive: SSE comment lines (`: ...`) are ignored by the client
	// but keep TCP/proxies from treating the stream as idle and closing it.
	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(sseKeepaliveInterval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-c.Request.Context().Done():
				return
			case <-ticker.C:
				w.ping()
			}
		}
	}()
	defer close(stop)

	if tty {
		_, _ = io.Copy(w, reader)
	} else {
		_, _ = stdcopy.StdCopy(w, w, reader)
	}
}

// sseLogWriter adapts io.Writer.Write to SSE `event: log` frames.
// Chunks are base64-encoded so the payload is safe for SSE's line-oriented format.
// Writes are serialized with a mutex so the keepalive ticker cannot interleave
// a comment in the middle of a data frame.
type sseLogWriter struct {
	mu sync.Mutex
	w  gin.ResponseWriter
}

func (s *sseLogWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	enc := base64.StdEncoding.EncodeToString(p)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := fmt.Fprintf(s.w, "event: log\ndata: %s\n\n", enc); err != nil {
		return 0, err
	}
	s.w.Flush()
	return len(p), nil
}

func (s *sseLogWriter) ping() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := fmt.Fprint(s.w, ": ping\n\n"); err != nil {
		return
	}
	s.w.Flush()
}
