package docker

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// DeployRequest holds everything needed to deploy an application.
type DeployRequest struct {
	AppID       string
	AppName     string // template name used as container name prefix
	Image       string
	Env         map[string]string
	Ports       []string
	Volumes     []string
	Labels      map[string]string
	CapAdd      []string
	Sysctls     map[string]string
	Args        []string
	ConfigFiles []DeployConfigFile
	DataDir     string // base data directory (e.g. /data)
	DataVolume  string // Docker named volume for DataDir (e.g. "passim_passim-data")
}

// DeployConfigFile is a config file to write before starting the container.
type DeployConfigFile struct {
	Path    string // relative to DataDir/apps/{name}/configs/
	Content string
}

// DeployResult is returned after a successful deployment.
type DeployResult struct {
	ContainerID string
}

// Deploy orchestrates the full deployment: write configs → pull image →
// stop/remove old container → create & start new one.
func Deploy(ctx context.Context, client DockerClient, req *DeployRequest) (*DeployResult, error) {
	if client == nil {
		return nil, fmt.Errorf("docker client is nil")
	}

	// 1. Pre-create volume directories and write config files
	if err := ensureVolumeDirs(req); err != nil {
		return nil, fmt.Errorf("create volume dirs: %w", err)
	}
	if err := writeConfigFiles(req); err != nil {
		return nil, fmt.Errorf("write configs: %w", err)
	}

	// 2. Pull image
	reader, err := client.PullImage(ctx, req.Image)
	if err != nil {
		return nil, fmt.Errorf("pull image %s: %w", req.Image, err)
	}
	if reader != nil {
		io.Copy(io.Discard, reader)
		reader.Close()
	}

	// 3. Stop and remove old container with same name (redeploy case)
	containerName := "passim-" + req.AppName + "-" + req.AppID[:8]
	removeExisting(ctx, client, containerName)

	// 4. Build env slice
	var envSlice []string
	for k, v := range req.Env {
		envSlice = append(envSlice, k+"="+v)
	}

	// 5. Ensure labels include passim metadata
	if req.Labels == nil {
		req.Labels = make(map[string]string)
	}
	req.Labels["io.passim.managed"] = "true"
	req.Labels["io.passim.app.id"] = req.AppID
	req.Labels["io.passim.app.template"] = req.AppName

	// 6. Create and start container
	cfg := &ContainerConfig{
		Name:          containerName,
		Image:         req.Image,
		Env:           envSlice,
		Ports:         req.Ports,
		Volumes:       req.Volumes,
		Labels:        req.Labels,
		CapAdd:        req.CapAdd,
		Sysctls:       req.Sysctls,
		Cmd:           req.Args,
		RestartPolicy: "unless-stopped",
		DataDir:       req.DataDir,
		DataVolume:    req.DataVolume,
	}

	id, err := client.CreateAndStartContainer(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create container: %w", err)
	}

	return &DeployResult{ContainerID: id}, nil
}

// Undeploy stops and removes the container for an app, and cleans up config files.
func Undeploy(ctx context.Context, client DockerClient, containerID string, appName string, appID string, dataDir string) error {
	if client == nil {
		return fmt.Errorf("docker client is nil")
	}

	// Stop + remove by container ID (if known)
	if containerID != "" {
		_ = client.StopContainer(ctx, containerID)
		_ = client.RemoveContainer(ctx, containerID)
	}

	// Also remove by container name — catches orphans from failed deploys
	// where containerID was never recorded in the DB
	if appName != "" && len(appID) >= 8 {
		containerName := "passim-" + appName + "-" + appID[:8]
		removeExisting(ctx, client, containerName)
	}

	// Clean up config directory
	if dataDir != "" && appName != "" && len(appID) >= 8 {
		configDir := filepath.Join(dataDir, "apps", appName+"-"+appID[:8], "configs")
		os.RemoveAll(configDir)
	}

	return nil
}

// ensureVolumeDirs pre-creates host-side directories for all volume mounts
// under DataDir. This is required for Docker volume subpath mounts which
// expect the subpath directory to already exist.
func ensureVolumeDirs(req *DeployRequest) error {
	if req.DataDir == "" {
		return nil
	}
	prefix := strings.TrimSuffix(req.DataDir, "/") + "/"
	for _, v := range req.Volumes {
		parts := strings.SplitN(v, ":", 2)
		hostPath := parts[0]
		if strings.HasPrefix(hostPath, prefix) {
			if err := os.MkdirAll(hostPath, 0755); err != nil {
				return fmt.Errorf("mkdir %s: %w", hostPath, err)
			}
		}
	}
	return nil
}

// writeConfigFiles writes rendered config files to disk.
func writeConfigFiles(req *DeployRequest) error {
	if len(req.ConfigFiles) == 0 {
		return nil
	}

	baseDir := filepath.Join(req.DataDir, "apps", req.AppName+"-"+req.AppID[:8], "configs")
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	for _, cf := range req.ConfigFiles {
		path := cf.Path
		if !filepath.IsAbs(path) {
			path = filepath.Join(baseDir, path)
		}

		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return fmt.Errorf("create dir for %s: %w", cf.Path, err)
		}

		if err := os.WriteFile(path, []byte(cf.Content), 0644); err != nil {
			return fmt.Errorf("write %s: %w", cf.Path, err)
		}
	}

	return nil
}

// removeExisting tries to stop and remove a container by name.
// It searches through all containers and removes any with a matching name.
func removeExisting(ctx context.Context, client DockerClient, name string) {
	containers, err := client.ListContainers(ctx)
	if err != nil {
		return
	}
	for _, c := range containers {
		for _, n := range c.Names {
			// Docker prefixes names with "/"
			trimmed := strings.TrimPrefix(n, "/")
			if trimmed == name {
				_ = client.StopContainer(ctx, c.ID)
				_ = client.RemoveContainer(ctx, c.ID)
				return
			}
		}
	}
}
