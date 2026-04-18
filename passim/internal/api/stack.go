package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/stack"
	"github.com/passim/passim/internal/task"
)

// Payloads / DTOs

type validateStackRequest struct {
	Name     string   `json:"name"`
	YAMLText string   `json:"yaml_text"`
	EnvText  string   `json:"env_text"`
	Profiles []string `json:"profiles"`
}

type createStackRequest = validateStackRequest

type stackResponse struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	YAMLText  string   `json:"yaml_text"`
	EnvText   string   `json:"env_text"`
	Profiles  []string `json:"profiles"`
	Status    string   `json:"status"`
	LastError string   `json:"last_error,omitempty"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

func toStackResponse(s *stack.Stack) stackResponse {
	return stackResponse{
		ID: s.ID, Name: s.Name, YAMLText: s.YAMLText, EnvText: s.EnvText,
		Profiles: s.Profiles, Status: s.Status, LastError: s.LastError,
		CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
}

// writeValidationError turns a stack.ValidationError into a 400 JSON body
// with a stable `code` the UI can translate.
func writeValidationError(c *gin.Context, err error) bool {
	var ve *stack.ValidationError
	if errors.As(err, &ve) {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    string(ve.Code),
			"message": ve.Message,
		})
		return true
	}
	return false
}

func validateStackHandler(_ Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req validateStackRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		name := stack.NormalizeName(req.Name)
		proj, warnings, err := stack.ParseAndValidate(c.Request.Context(), name, req.YAMLText, req.EnvText, req.Profiles)
		if err != nil {
			if writeValidationError(c, err) {
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"code": "stack.yaml_parse_error", "message": err.Error()})
			return
		}
		services := make([]string, 0, len(proj.Services))
		for n := range proj.Services {
			services = append(services, n)
		}
		if warnings == nil {
			warnings = []stack.Warning{}
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":       true,
			"name":     name,
			"services": services,
			"warnings": warnings,
		})
	}
}

func createStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req createStackRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		name := stack.NormalizeName(req.Name)

		// Full parse to surface errors synchronously (so the UI sees them
		// as HTTP 400 rather than having to poll task status).
		if _, _, err := stack.ParseAndValidate(c.Request.Context(), name, req.YAMLText, req.EnvText, req.Profiles); err != nil {
			if writeValidationError(c, err) {
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"code": "stack.yaml_parse_error", "message": err.Error()})
			return
		}

		existing, err := stack.GetByName(deps.DB, name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if existing != nil {
			c.JSON(http.StatusConflict, gin.H{
				"code":    "stack.name_taken",
				"message": fmt.Sprintf("stack with name %q already exists", name),
			})
			return
		}

		s := &stack.Stack{
			ID:       uuid.New().String(),
			Name:     name,
			YAMLText: req.YAMLText,
			EnvText:  req.EnvText,
			Profiles: req.Profiles,
			Status:   stack.StatusDeploying,
		}
		if err := stack.Insert(deps.DB, s); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID})
		taskID, err := deps.Tasks.Enqueue("stack-up", s.ID, string(payload))
		if err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, "enqueue task: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue task: " + err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"stack_id": s.ID,
			"task_id":  taskID,
		})
	}
}

func listStacksHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		stacks, err := stack.List(deps.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		out := make([]stackResponse, 0, len(stacks))
		for i := range stacks {
			out = append(out, toStackResponse(&stacks[i]))
		}
		c.JSON(http.StatusOK, gin.H{"stacks": out})
	}
}

func getStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		s, err := stack.Get(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
			return
		}
		c.JSON(http.StatusOK, toStackResponse(s))
	}
}

func deleteStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		s, err := stack.Get(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
			return
		}
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusTearingDown, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID})
		taskID, err := deps.Tasks.Enqueue("stack-down", s.ID, string(payload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue task: " + err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// -----------------------------------------------------------------------------
// Task handlers

type stackTaskPayload struct {
	StackID string `json:"stack_id"`
}

// RegisterStackTaskHandlers wires stack-up / stack-down into the task queue.
func RegisterStackTaskHandlers(q *task.Queue, deps Deps) {
	q.RegisterHandler("stack-up", makeStackUpHandler(deps))
	q.RegisterHandler("stack-down", makeStackDownHandler(deps))
}

func makeStackUpHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var payload stackTaskPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse stack-up payload: %w", err)
		}
		s, err := stack.Get(deps.DB, payload.StackID)
		if err != nil || s == nil {
			return fmt.Errorf("load stack %s: %w", payload.StackID, err)
		}

		proj, _, err := stack.ParseAndValidate(ctx, s.Name, s.YAMLText, s.EnvText, s.Profiles)
		if err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}

		req := &stack.DeployRequest{
			Stack:        s,
			Project:      proj,
			Docker:       deps.Docker,
			DataDir:      deps.DataDir,
			DataVolume:   deps.DataVolume,
			DataHostPath: deps.DataHostPath,
		}
		if err := stack.Deploy(ctx, req); err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}
		return stack.UpdateStatus(deps.DB, s.ID, stack.StatusRunning, "")
	}
}

func makeStackDownHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var payload stackTaskPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse stack-down payload: %w", err)
		}
		s, err := stack.Get(deps.DB, payload.StackID)
		if err != nil {
			return err
		}
		if s == nil {
			return nil // already gone
		}
		if err := stack.TearDown(ctx, deps.Docker, s.Name); err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}
		return stack.Delete(deps.DB, s.ID)
	}
}
