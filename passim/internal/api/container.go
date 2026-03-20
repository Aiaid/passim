package api

import (
	"bytes"
	"io"
	"net/http"
	"strconv"

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
