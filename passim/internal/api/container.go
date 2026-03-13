package api

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func requireDocker(deps Deps, c *gin.Context) bool {
	if deps.Docker == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "docker is not available"})
		return false
	}
	return true
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

		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.Status(http.StatusOK)
		io.Copy(c.Writer, reader)
	}
}
