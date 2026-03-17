package update

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/docker/docker/api/types"
	"github.com/passim/passim/internal/docker"
)

// Updater handles pulling new images and orchestrating the container switch.
type Updater struct {
	docker    docker.DockerClient
	imageName string // e.g. "ghcr.io/passim/passim"
}

// NewUpdater creates an updater.
// imageName is the Docker image base name without tag (e.g. "ghcr.io/passim/passim").
func NewUpdater(dockerClient docker.DockerClient, imageName string) *Updater {
	return &Updater{
		docker:    dockerClient,
		imageName: imageName,
	}
}

// SelfContainerID returns the container ID of the running process
// (in Docker, hostname = container ID).
func SelfContainerID() string {
	hostname, err := os.Hostname()
	if err != nil {
		return ""
	}
	return hostname
}

// Execute pulls the new image and launches a helper container to
// perform the actual container switch. The helper stops the current
// container, recreates it with the new image, and starts it.
//
// This method returns after the helper is started. The caller should
// expect the current process to be stopped shortly after.
func (u *Updater) Execute(ctx context.Context, targetVersion string) error {
	newImage := u.imageName + ":" + targetVersion

	// 1. Pull the new image
	log.Printf("update: pulling %s", newImage)
	reader, err := u.docker.PullImage(ctx, newImage)
	if err != nil {
		return fmt.Errorf("pull image: %w", err)
	}
	// Drain the reader to complete the pull
	io.Copy(io.Discard, reader)
	reader.Close()

	// 2. Inspect our own container to get its config
	selfID := SelfContainerID()
	if selfID == "" {
		return fmt.Errorf("cannot determine own container ID (not running in Docker?)")
	}

	selfInfo, err := u.docker.InspectContainer(ctx, selfID)
	if err != nil {
		return fmt.Errorf("inspect self: %w", err)
	}

	// 3. Encode the container config as JSON for the helper
	configPayload, err := encodeContainerConfig(selfInfo, newImage)
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	// 4. Launch helper container (using the NEW image) to do the switch
	containerName := selfInfo.Name
	if len(containerName) > 0 && containerName[0] == '/' {
		containerName = containerName[1:]
	}

	helperCfg := &docker.ContainerConfig{
		Name:  "passim-updater",
		Image: newImage,
		Cmd: []string{
			"passim", "update-exec",
			"--target=" + selfID,
			"--name=" + containerName,
			"--config=" + configPayload,
		},
		Volumes: []string{"/var/run/docker.sock:/var/run/docker.sock"},
	}

	log.Printf("update: launching helper container for switch to %s", targetVersion)
	_, err = u.docker.CreateAndStartContainer(ctx, helperCfg)
	if err != nil {
		return fmt.Errorf("start helper: %w", err)
	}

	return nil
}

// SwitchConfig holds the container configuration needed to recreate it.
type SwitchConfig struct {
	Image        string            `json:"image"`
	Env          []string          `json:"env"`
	Binds        []string          `json:"binds"`
	PortBindings map[string]string `json:"port_bindings"` // "8443/tcp" -> "8443"
	Labels       map[string]string `json:"labels"`
	CapAdd       []string          `json:"cap_add"`
	RestartPolicy string           `json:"restart_policy"`
}

// encodeContainerConfig extracts the relevant config from a ContainerJSON
// and encodes it as base64 JSON for passing to the helper.
func encodeContainerConfig(info types.ContainerJSON, newImage string) (string, error) {
	cfg := SwitchConfig{
		Image:  newImage,
		Env:    info.Config.Env,
		Labels: info.Config.Labels,
	}

	if info.HostConfig != nil {
		cfg.Binds = info.HostConfig.Binds
		cfg.CapAdd = info.HostConfig.CapAdd
		cfg.RestartPolicy = string(info.HostConfig.RestartPolicy.Name)

		cfg.PortBindings = make(map[string]string)
		for port, bindings := range info.HostConfig.PortBindings {
			if len(bindings) > 0 {
				cfg.PortBindings[string(port)] = bindings[0].HostPort
			}
		}
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// DecodeSwitchConfig decodes a base64-encoded SwitchConfig.
func DecodeSwitchConfig(encoded string) (*SwitchConfig, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	var cfg SwitchConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("json decode: %w", err)
	}
	return &cfg, nil
}
