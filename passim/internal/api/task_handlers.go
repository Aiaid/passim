package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
)

// RegisterTaskHandlers registers the deploy and undeploy task handlers on the queue.
func RegisterTaskHandlers(q *task.Queue, deps Deps) {
	q.RegisterHandler("deploy", makeDeployHandler(deps))
	q.RegisterHandler("undeploy", makeUndeployHandler(deps))
}

func makeDeployHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var req docker.DeployRequest
		if err := json.Unmarshal([]byte(t.Payload), &req); err != nil {
			return fmt.Errorf("parse deploy payload: %w", err)
		}

		appID := t.Target // target is the app ID

		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"running","message":"pulling image"}`)
		publishEvent(deps.SSE, "app:"+appID, "progress", `{"status":"deploying","progress":25}`)

		result, err := docker.Deploy(ctx, deps.Docker, &req)
		if err != nil {
			// Update app status to failed
			_ = db.UpdateApp(deps.DB, appID, "failed", "")
			publishEvent(deps.SSE, "app:"+appID, "deploy", `{"status":"failed"}`)
			return fmt.Errorf("deploy: %w", err)
		}

		// Update app status to running with container ID
		if err := db.UpdateApp(deps.DB, appID, "running", result.ContainerID); err != nil {
			log.Printf("task %s: failed to update app %s: %v", t.ID, appID, err)
		}

		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"completed"}`)
		publishEvent(deps.SSE, "app:"+appID, "deploy", `{"status":"running"}`)
		publishEvent(deps.SSE, "app:"+appID, "progress", `{"status":"running","progress":100}`)

		return nil
	}
}

func makeUndeployHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var payload undeployPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse undeploy payload: %w", err)
		}

		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"running","message":"stopping container"}`)

		err := docker.Undeploy(ctx, deps.Docker, payload.ContainerID, payload.Template, payload.AppID, payload.DataDir)
		if err != nil {
			return fmt.Errorf("undeploy: %w", err)
		}

		// Delete app record from DB
		if err := db.DeleteApp(deps.DB, payload.AppID); err != nil {
			log.Printf("task %s: failed to delete app %s: %v", t.ID, payload.AppID, err)
		}

		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"completed"}`)
		publishEvent(deps.SSE, "app:"+payload.AppID, "deploy", `{"status":"deleted"}`)

		return nil
	}
}

// publishEvent publishes an SSE event if the broker is available.
func publishEvent(broker *sse.Broker, topic, eventType, data string) {
	if broker == nil {
		return
	}
	broker.Publish(sse.Event{
		Topic: topic,
		Type:  eventType,
		Data:  data,
	})
}
