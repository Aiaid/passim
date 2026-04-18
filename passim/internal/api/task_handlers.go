package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/docker"
	"github.com/passim/passim/internal/sse"
	"github.com/passim/passim/internal/task"
)

// ensureSharedCertForDeploy exports the SSL cert to the shared dir if any volume
// in the deploy request mounts that dir. This is the bottom-half safety net for
// auto/letsencrypt mode where the background ExportToShared goroutine may not
// have completed its first successful run yet (e.g. ACME just finished). Failure
// is logged but not fatal: the container will fail to start if the cert is
// genuinely missing, surfacing the real error to the user via task status.
func ensureSharedCertForDeploy(deps Deps, req *docker.DeployRequest) {
	if deps.SSL == nil {
		return
	}
	sharedDir := deps.SSL.SharedCertDir()
	if !volumesNeedSharedCert(req.Volumes, sharedDir) {
		return
	}
	if _, err := deps.SSL.ExportToShared(); err != nil {
		log.Printf("warning: ensure shared cert for %s: %v", req.AppName, err)
	}
}

// volumesNeedSharedCert reports whether any volume spec ("host:container[:opts]")
// has a host path equal to or under sharedDir.
func volumesNeedSharedCert(volumes []string, sharedDir string) bool {
	if sharedDir == "" {
		return false
	}
	prefix := strings.TrimSuffix(sharedDir, "/") + "/"
	for _, v := range volumes {
		host := v
		if i := strings.Index(v, ":"); i >= 0 {
			host = v[:i]
		}
		if host == strings.TrimSuffix(sharedDir, "/") || strings.HasPrefix(host, prefix) {
			return true
		}
	}
	return false
}

// RegisterTaskHandlers registers the deploy and undeploy task handlers on the queue.
func RegisterTaskHandlers(q *task.Queue, deps Deps) {
	q.RegisterHandler("deploy", makeDeployHandler(deps))
	q.RegisterHandler("undeploy", makeUndeployHandler(deps))
	RegisterStackTaskHandlers(q, deps)
}

func makeDeployHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var req docker.DeployRequest
		if err := json.Unmarshal([]byte(t.Payload), &req); err != nil {
			return fmt.Errorf("parse deploy payload: %w", err)
		}

		appID := t.Target // target is the app ID

		// Make sure the shared TLS cert is on disk before any container that
		// mounts /etc/passim-ssl tries to start. Cheap and idempotent — only
		// hits SSL when the rendered volumes actually reference the shared dir.
		ensureSharedCertForDeploy(deps, &req)

		// Phase 1: Pull image (usually the slowest step)
		_ = task.UpdateStatus(deps.DB, t.ID, "pulling", "", t.Retries)
		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"pulling"}`)
		publishEvent(deps.SSE, "app:"+appID, "progress", `{"status":"pulling","progress":25}`)

		if err := docker.PrepareAndPull(ctx, deps.Docker, &req); err != nil {
			if t.Retries+1 >= t.MaxRetries {
				_ = db.UpdateApp(deps.DB, appID, "failed", "")
				publishEvent(deps.SSE, "app:"+appID, "deploy", `{"status":"failed"}`)
			}
			return fmt.Errorf("deploy: %w", err)
		}

		// Phase 2: Create and start container
		_ = task.UpdateStatus(deps.DB, t.ID, "deploying", "", t.Retries)
		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"deploying"}`)
		publishEvent(deps.SSE, "app:"+appID, "progress", `{"status":"deploying","progress":75}`)

		result, err := docker.CreateAndRun(ctx, deps.Docker, &req)
		if err != nil {
			if t.Retries+1 >= t.MaxRetries {
				_ = db.UpdateApp(deps.DB, appID, "failed", "")
				publishEvent(deps.SSE, "app:"+appID, "deploy", `{"status":"failed"}`)
			}
			return fmt.Errorf("deploy: %w", err)
		}

		// Update app status to running with container ID
		if err := db.UpdateApp(deps.DB, appID, "running", result.ContainerID); err != nil {
			log.Printf("task %s: failed to update app %s: %v", t.ID, appID, err)
		}

		// Auto-create default user for apps using http_auth
		if deps.Templates != nil {
			app, _ := db.GetApp(deps.DB, appID)
			if app != nil {
				if tmpl, ok := deps.Templates.Get(app.Template); ok {
					if tmpl.Users != nil && tmpl.Users.Add != nil && tmpl.Users.Add.Method == "http_auth" {
						count, _ := db.CountAppUsers(deps.DB, appID)
						if count == 0 {
							// Extract password from app settings
							var settings map[string]interface{}
							json.Unmarshal([]byte(app.Settings), &settings)
							pw, _ := settings["password"].(string)
							if pw != "" {
								defaultUser := &db.AppUser{
									ID:       "default-" + appID[:8],
									AppID:    appID,
									Username: "admin",
									Password: pw,
									Enabled:  true,
								}
								if err := db.CreateAppUser(deps.DB, defaultUser); err != nil {
									log.Printf("task %s: failed to create default user for %s: %v", t.ID, appID, err)
								}
							}
						}
					}

					// Start metrics polling if template has metrics config
					if deps.MetricsCollector != nil && tmpl.Metrics != nil {
						deps.MetricsCollector.StartPolling(app, tmpl)
					}
				}
			}
		}

		publishEvent(deps.SSE, "task:"+t.ID, "status", `{"status":"completed"}`)
		publishEvent(deps.SSE, "app:"+appID, "deploy", `{"status":"running"}`)
		publishEvent(deps.SSE, "app:"+appID, "progress", `{"status":"running","progress":100}`)
		notifyRefresh(deps, "_:apps", "_:containers")

		return nil
	}
}

func makeUndeployHandler(deps Deps) task.TaskHandler {
	return func(ctx context.Context, t *task.Task) error {
		var payload undeployPayload
		if err := json.Unmarshal([]byte(t.Payload), &payload); err != nil {
			return fmt.Errorf("parse undeploy payload: %w", err)
		}

		// Stop metrics polling before removing the container
		if deps.MetricsCollector != nil {
			deps.MetricsCollector.StopPolling(payload.AppID)
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
		notifyRefresh(deps, "_:apps", "_:containers")

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
