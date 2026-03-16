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

// PrepareAndPull writes config files and pulls the container image.
// This is the first phase of deployment (typically the slowest due to image pull).
func PrepareAndPull(ctx context.Context, client DockerClient, req *DeployRequest) error {
	if client == nil {
		return fmt.Errorf("docker client is nil")
	}

	if err := ensureVolumeDirs(req); err != nil {
		return fmt.Errorf("create volume dirs: %w", err)
	}
	if err := writeConfigFiles(req); err != nil {
		return fmt.Errorf("write configs: %w", err)
	}

	reader, err := client.PullImage(ctx, req.Image)
	if err != nil {
		return fmt.Errorf("pull image %s: %w", req.Image, err)
	}
	if reader != nil {
		io.Copy(io.Discard, reader)
		reader.Close()
	}
	return nil
}

// CreateAndRun stops any old container and creates + starts the new one.
// This is the second phase of deployment.
func CreateAndRun(ctx context.Context, client DockerClient, req *DeployRequest) (*DeployResult, error) {
	if client == nil {
		return nil, fmt.Errorf("docker client is nil")
	}

	containerName := "passim-" + req.AppName + "-" + req.AppID[:8]
	removeExisting(ctx, client, containerName)

	var envSlice []string
	for k, v := range req.Env {
		envSlice = append(envSlice, k+"="+v)
	}

	if req.Labels == nil {
		req.Labels = make(map[string]string)
	}
	req.Labels["io.passim.managed"] = "true"
	req.Labels["io.passim.app.id"] = req.AppID
	req.Labels["io.passim.app.template"] = req.AppName

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

// Deploy orchestrates the full deployment in one call.
// Used by the sync path (no task queue). For async deploys with progress,
// use PrepareAndPull + CreateAndRun separately.
func Deploy(ctx context.Context, client DockerClient, req *DeployRequest) (*DeployResult, error) {
	if err := PrepareAndPull(ctx, client, req); err != nil {
		return nil, err
	}
	return CreateAndRun(ctx, client, req)
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

	// Clean up app directory (configs, state, etc.)
	if dataDir != "" && appName != "" && len(appID) >= 8 {
		appDir := filepath.Join(dataDir, "apps", appName+"-"+appID[:8])
		os.RemoveAll(appDir)
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
