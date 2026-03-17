package update

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/passim/passim/internal/docker"
)

// ExecSwitch is called by the helper container ("passim update-exec").
// It stops the old container, recreates it with the new image, and starts it.
// On failure, it attempts to rollback.
func ExecSwitch(ctx context.Context, dockerClient docker.DockerClient, targetID, name, encodedConfig string) error {
	cfg, err := DecodeSwitchConfig(encodedConfig)
	if err != nil {
		return fmt.Errorf("decode config: %w", err)
	}

	log.Printf("update-exec: stopping container %s (%s)", name, targetID)
	if err := dockerClient.StopContainer(ctx, targetID); err != nil {
		return fmt.Errorf("stop old container: %w", err)
	}

	// Rename old container so we can reuse the name
	oldName := name + "-old"
	log.Printf("update-exec: renaming %s → %s", name, oldName)
	if err := dockerClient.RenameContainer(ctx, targetID, oldName); err != nil {
		// Try to restart old container if rename fails
		log.Printf("update-exec: rename failed, restarting old container: %v", err)
		dockerClient.StartContainer(ctx, targetID)
		return fmt.Errorf("rename old container: %w", err)
	}

	// Build port mappings for the new container
	var ports []string
	for containerPort, hostPort := range cfg.PortBindings {
		// containerPort is like "8443/tcp", we need "hostPort:containerPort"
		port := strings.Split(containerPort, "/")[0]
		proto := "tcp"
		if parts := strings.Split(containerPort, "/"); len(parts) > 1 {
			proto = parts[1]
		}
		ports = append(ports, fmt.Sprintf("%s:%s/%s", hostPort, port, proto))
	}

	newCfg := &docker.ContainerConfig{
		Name:          name,
		Image:         cfg.Image,
		Env:           cfg.Env,
		Volumes:       cfg.Binds,
		Ports:         ports,
		Labels:        cfg.Labels,
		CapAdd:        cfg.CapAdd,
		RestartPolicy: cfg.RestartPolicy,
	}

	log.Printf("update-exec: creating new container %s with image %s", name, cfg.Image)
	newID, err := dockerClient.CreateAndStartContainer(ctx, newCfg)
	if err != nil {
		log.Printf("update-exec: create failed, rolling back: %v", err)
		return rollback(ctx, dockerClient, targetID, oldName, name, err)
	}

	// Health check — wait for the new container to respond
	log.Printf("update-exec: health checking new container %s", newID)
	if err := waitForHealthy(ctx, name, 60*time.Second); err != nil {
		log.Printf("update-exec: health check failed, rolling back: %v", err)
		// Stop and remove the unhealthy new container
		dockerClient.StopContainer(ctx, newID)
		dockerClient.RemoveContainer(ctx, newID)
		return rollback(ctx, dockerClient, targetID, oldName, name, err)
	}

	// Success — remove old container
	log.Printf("update-exec: update successful, removing old container %s", oldName)
	dockerClient.RemoveContainer(ctx, targetID)

	return nil
}

// rollback restores the old container after a failed update.
func rollback(ctx context.Context, dockerClient docker.DockerClient, oldID, oldName, originalName string, originalErr error) error {
	log.Printf("update-exec: rolling back to %s", oldName)

	// Rename old container back to original name
	if err := dockerClient.RenameContainer(ctx, oldID, originalName); err != nil {
		return fmt.Errorf("rollback rename failed: %w (original error: %v)", err, originalErr)
	}

	// Start old container
	if err := dockerClient.StartContainer(ctx, oldID); err != nil {
		return fmt.Errorf("rollback start failed: %w (original error: %v)", err, originalErr)
	}

	return fmt.Errorf("update failed (rolled back successfully): %w", originalErr)
}

// waitForHealthy polls the container's health endpoint until it responds.
func waitForHealthy(ctx context.Context, containerName string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: nil, // Will be set below
		},
	}

	// Try both HTTPS (self-signed) and HTTP
	urls := []string{
		fmt.Sprintf("https://%s:8443/api/version", containerName),
		fmt.Sprintf("http://%s:8443/api/version", containerName),
	}

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		for _, url := range urls {
			resp, err := client.Get(url)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					return nil
				}
			}
		}

		time.Sleep(2 * time.Second)
	}

	return fmt.Errorf("health check timed out after %s", timeout)
}
