package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"

	"github.com/compose-spec/compose-go/v2/types"
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
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	YAMLText  string         `json:"yaml_text"`
	EnvText   string         `json:"env_text"`
	Profiles  []string       `json:"profiles"`
	Status    string         `json:"status"`
	LastError string         `json:"last_error,omitempty"`
	CreatedAt string         `json:"created_at"`
	UpdatedAt string         `json:"updated_at"`
	Services  []stackService `json:"services,omitempty"`
}

// stackService is the per-service container snapshot GET /api/stacks/:id
// attaches so the UI can render a service list without extra round-trips.
// Populated only for single-stack lookups — the list endpoint skips it to
// keep that hot path cheap.
type stackService struct {
	Name        string   `json:"name"`
	Image       string   `json:"image,omitempty"`
	ContainerID string   `json:"container_id,omitempty"`
	State       string   `json:"state,omitempty"`  // running / exited / ...
	Status      string   `json:"status,omitempty"` // "Up 30 seconds"
	Ports       []string `json:"ports,omitempty"`  // "0.0.0.0:8080->80/tcp"
}

func toStackResponse(s *stack.Stack) stackResponse {
	return stackResponse{
		ID: s.ID, Name: s.Name, YAMLText: s.YAMLText, EnvText: s.EnvText,
		Profiles: s.Profiles, Status: s.Status, LastError: s.LastError,
		CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
}

// collectStackServices asks Docker for every container labeled with the
// stack's id and shapes them into per-service snapshots. Services without a
// container (not yet started, or torn down) appear with empty fields so the
// UI can distinguish "service exists in YAML" from "service is running".
func collectStackServices(ctx context.Context, deps Deps, s *stack.Stack) []stackService {
	// Parse YAML to enumerate declared services even when no containers
	// exist (e.g. stopped stack). Failures fall back to label-only data.
	var serviceNames []string
	if proj, _, err := stack.ParseAndValidate(ctx, s.Name, s.YAMLText, s.EnvText, s.Profiles); err == nil && proj != nil {
		for name := range proj.Services {
			serviceNames = append(serviceNames, name)
		}
	}

	byService := make(map[string]stackService)
	if containers, err := deps.Docker.ListContainers(ctx); err == nil {
		for _, c := range containers {
			if c.Labels[stack.LabelStackID] != s.ID {
				continue
			}
			svcName := c.Labels[stack.LabelStackService]
			if svcName == "" {
				continue
			}
			ports := make([]string, 0, len(c.Ports))
			for _, p := range c.Ports {
				if p.PublicPort == 0 {
					continue
				}
				ports = append(ports, fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, p.Type))
			}
			byService[svcName] = stackService{
				Name:        svcName,
				Image:       c.Image,
				ContainerID: c.ID,
				State:       c.State,
				Status:      c.Status,
				Ports:       ports,
			}
		}
	}

	out := make([]stackService, 0, len(serviceNames))
	seen := make(map[string]struct{}, len(serviceNames))
	for _, name := range serviceNames {
		seen[name] = struct{}{}
		if snap, ok := byService[name]; ok {
			out = append(out, snap)
		} else {
			out = append(out, stackService{Name: name})
		}
	}
	// Containers whose service name isn't in the (current) YAML — can happen
	// right after a PUT that dropped a service; still useful to show so the
	// user can see what's winding down.
	for name, snap := range byService {
		if _, ok := seen[name]; !ok {
			out = append(out, snap)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
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
		resp := toStackResponse(s)
		resp.Services = collectStackServices(c.Request.Context(), deps, s)
		c.JSON(http.StatusOK, resp)
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
		keepVolumes := c.Query("keep_volumes") == "true"
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusTearingDown, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID, KeepVolumes: keepVolumes})
		taskID, err := deps.Tasks.Enqueue("stack-down", s.ID, string(payload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue task: " + err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// updateStackHandler rewrites a stack's YAML / env / profiles and re-deploys.
// Phase 2 policy: any change tears the stack down and brings it back up
// under the new spec. Per-service diff (stop only changed services) is
// deferred to phase 3 where healthcheck makes it safe.
func updateStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req createStackRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		s, err := stack.Get(deps.DB, id)
		if err != nil || s == nil {
			if s == nil && err == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s.Status == stack.StatusDeploying || s.Status == stack.StatusTearingDown {
			c.JSON(http.StatusConflict, gin.H{
				"code": string(stack.ErrStackBusy),
				"message": fmt.Sprintf("stack is %s; try again once it settles", s.Status),
			})
			return
		}
		// Keep original name — PUT doesn't rename.
		if _, _, err := stack.ParseAndValidate(c.Request.Context(), s.Name, req.YAMLText, req.EnvText, req.Profiles); err != nil {
			if writeValidationError(c, err) {
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"code": "stack.yaml_parse_error", "message": err.Error()})
			return
		}
		if err := stack.UpdateYAML(deps.DB, s.ID, req.YAMLText, req.EnvText, req.Profiles); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusDeploying, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID})
		taskID, err := deps.Tasks.Enqueue("stack-redeploy", s.ID, string(payload))
		if err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, "enqueue task: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue task: " + err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// upStackHandler re-runs deploy on a stack that's currently stopped or
// errored. No-op against a running stack (409).
func upStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		s, err := stack.Get(deps.DB, id)
		if err != nil || s == nil {
			if s == nil && err == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s.Status == stack.StatusRunning || s.Status == stack.StatusDeploying {
			c.JSON(http.StatusConflict, gin.H{
				"code": string(stack.ErrStackDeployBusy),
				"message": fmt.Sprintf("stack is %s", s.Status),
			})
			return
		}
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusDeploying, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID})
		taskID, err := deps.Tasks.Enqueue("stack-up", s.ID, string(payload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// downStackHandler tears down containers but keeps the DB row + volumes so
// the stack can be brought back up later.
func downStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		s, err := stack.Get(deps.DB, id)
		if err != nil || s == nil {
			if s == nil && err == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s.Status != stack.StatusRunning && s.Status != stack.StatusError {
			c.JSON(http.StatusConflict, gin.H{
				"code": string(stack.ErrStackBusy),
				"message": fmt.Sprintf("stack is %s", s.Status),
			})
			return
		}
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusTearingDown, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		// down keeps volumes by default — users are explicitly saying "stop,
		// I might bring this back". DELETE is the operation that purges.
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID, KeepVolumes: true})
		taskID, err := deps.Tasks.Enqueue("stack-down-keep", s.ID, string(payload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// restartStackHandler is down + up as a single task. Keeps volumes.
func restartStackHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		s, err := stack.Get(deps.DB, id)
		if err != nil || s == nil {
			if s == nil && err == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "stack not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if s.Status == stack.StatusDeploying || s.Status == stack.StatusTearingDown {
			c.JSON(http.StatusConflict, gin.H{
				"code": string(stack.ErrStackBusy),
				"message": fmt.Sprintf("stack is %s", s.Status),
			})
			return
		}
		if err := stack.UpdateStatus(deps.DB, s.ID, stack.StatusDeploying, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(stackTaskPayload{StackID: s.ID})
		taskID, err := deps.Tasks.Enqueue("stack-restart", s.ID, string(payload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"stack_id": s.ID, "task_id": taskID})
	}
}

// -----------------------------------------------------------------------------
// Task handlers

type stackTaskPayload struct {
	StackID     string `json:"stack_id"`
	KeepVolumes bool   `json:"keep_volumes,omitempty"`
}

// RegisterStackTaskHandlers wires stack-up / stack-down / stack-down-keep /
// stack-redeploy / stack-restart into the task queue.
func RegisterStackTaskHandlers(q *task.Queue, deps Deps) {
	q.RegisterHandler("stack-up", makeStackUpHandler(deps))
	q.RegisterHandler("stack-down", makeStackDownHandler(deps))
	// stack-down-keep reuses the same down handler but the payload asks it
	// to keep the DB row (deletion-vs-teardown is driven by payload flags).
	q.RegisterHandler("stack-down-keep", makeStackDownKeepHandler(deps))
	q.RegisterHandler("stack-redeploy", makeStackRedeployHandler(deps))
	q.RegisterHandler("stack-restart", makeStackRedeployHandler(deps))
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
		// Re-parse so tear-down can reach top-level networks / non-external
		// volumes. Parse failures during tear-down aren't fatal — fall back
		// to label-only reaping.
		var proj *types.Project
		if p, _, perr := stack.ParseAndValidate(ctx, s.Name, s.YAMLText, s.EnvText, s.Profiles); perr == nil {
			proj = p
		}
		if err := stack.TearDownWithProject(ctx, deps.Docker, s, proj, !payload.KeepVolumes); err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}
		return stack.Delete(deps.DB, s.ID)
	}
}

// makeStackDownKeepHandler is the non-destructive "down": tear down
// containers (and top-level networks) but keep the DB row and volumes, so
// the user can run /up again later.
func makeStackDownKeepHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var payload stackTaskPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse stack-down-keep payload: %w", err)
		}
		s, err := stack.Get(deps.DB, payload.StackID)
		if err != nil || s == nil {
			return err
		}
		var proj *types.Project
		if p, _, perr := stack.ParseAndValidate(ctx, s.Name, s.YAMLText, s.EnvText, s.Profiles); perr == nil {
			proj = p
		}
		if err := stack.TearDownWithProject(ctx, deps.Docker, s, proj, false); err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}
		return stack.UpdateStatus(deps.DB, s.ID, stack.StatusStopped, "")
	}
}

// makeStackRedeployHandler handles both PUT (yaml changed) and restart:
// tear down then up. Since Phase-2 policy is "any change is a full restart",
// both endpoints share the same handler.
func makeStackRedeployHandler(deps Deps) task.TaskHandler {
	up := makeStackUpHandler(deps)
	return func(ctx context.Context, t *task.Task) error {
		var payload stackTaskPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse stack-redeploy payload: %w", err)
		}
		s, err := stack.Get(deps.DB, payload.StackID)
		if err != nil || s == nil {
			return err
		}
		var proj *types.Project
		if p, _, perr := stack.ParseAndValidate(ctx, s.Name, s.YAMLText, s.EnvText, s.Profiles); perr == nil {
			proj = p
		}
		// Restart keeps volumes; only DELETE removes them.
		if err := stack.TearDownWithProject(ctx, deps.Docker, s, proj, false); err != nil {
			_ = stack.UpdateStatus(deps.DB, s.ID, stack.StatusError, err.Error())
			return err
		}
		// Chain into the same up path so the new YAML is what gets deployed.
		return up(ctx, t)
	}
}
