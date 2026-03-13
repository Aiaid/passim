package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/task"
)

func listTasksHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		tasks, err := task.List(deps.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "list tasks: " + err.Error()})
			return
		}
		if tasks == nil {
			tasks = []task.Task{}
		}
		c.JSON(http.StatusOK, tasks)
	}
}

func getTaskHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		t, err := task.Get(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if t == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		c.JSON(http.StatusOK, t)
	}
}
