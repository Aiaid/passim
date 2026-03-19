package docker

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// ExecSession represents an interactive exec session attached to a container.
type ExecSession struct {
	ID   string               // exec ID (for resize)
	Conn types.HijackedResponse // bidirectional stream
}

// DockerClient is the interface for interacting with Docker.
// It can be mocked for testing.
type DockerClient interface {
	ListContainers(ctx context.Context) ([]container.Summary, error)
	StartContainer(ctx context.Context, id string) error
	StopContainer(ctx context.Context, id string) error
	RestartContainer(ctx context.Context, id string) error
	RemoveContainer(ctx context.Context, id string) error
	InspectContainer(ctx context.Context, id string) (types.ContainerJSON, error)
	ContainerLogs(ctx context.Context, id string, lines int) (io.ReadCloser, error)
	PullImage(ctx context.Context, ref string) (io.ReadCloser, error)
	CreateAndStartContainer(ctx context.Context, cfg *ContainerConfig) (string, error)
	RenameContainer(ctx context.Context, id string, newName string) error
	ExecContainer(ctx context.Context, id string, cmd []string) (string, error)
	ExecInteractive(ctx context.Context, id string, cmd []string) (*ExecSession, error)
	ResizeExec(ctx context.Context, execID string, height, width uint) error
	Ping(ctx context.Context) error
	Close() error
}

// ContainerConfig holds the configuration for creating a new container.
type ContainerConfig struct {
	Name          string
	Image         string
	Env           []string
	Ports         []string          // "host:container[/proto]" format
	Volumes       []string          // "host:container[:ro]" format
	Labels        map[string]string
	CapAdd        []string
	Sysctls       map[string]string
	Cmd           []string
	RestartPolicy string
	// DataDir is the data directory path inside the Passim container (e.g. "/data").
	// Used to identify which volume specs should be converted to named volume mounts.
	DataDir string
	// DataVolume is the Docker named volume backing DataDir (e.g. "passim_passim-data").
	// When set, volume specs with host paths under DataDir are converted to
	// volume mounts with Subpath instead of bind mounts, solving Docker-in-Docker
	// path visibility issues.
	// When empty, all volumes are treated as bind mounts (dev/non-Docker mode).
	DataVolume string
}

// Client wraps the Docker SDK client and implements DockerClient.
type Client struct {
	cli *client.Client
}

func NewClient() (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}
	return &Client{cli: cli}, nil
}

func (c *Client) Close() error {
	return c.cli.Close()
}

func (c *Client) ListContainers(ctx context.Context) ([]container.Summary, error) {
	return c.cli.ContainerList(ctx, container.ListOptions{All: true})
}

func (c *Client) StartContainer(ctx context.Context, id string) error {
	return c.cli.ContainerStart(ctx, id, container.StartOptions{})
}

func (c *Client) StopContainer(ctx context.Context, id string) error {
	return c.cli.ContainerStop(ctx, id, container.StopOptions{})
}

func (c *Client) RestartContainer(ctx context.Context, id string) error {
	return c.cli.ContainerRestart(ctx, id, container.StopOptions{})
}

func (c *Client) RemoveContainer(ctx context.Context, id string) error {
	return c.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true})
}

func (c *Client) InspectContainer(ctx context.Context, id string) (types.ContainerJSON, error) {
	return c.cli.ContainerInspect(ctx, id)
}

func (c *Client) ContainerLogs(ctx context.Context, id string, lines int) (io.ReadCloser, error) {
	tail := fmt.Sprintf("%d", lines)
	return c.cli.ContainerLogs(ctx, id, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tail,
	})
}

func (c *Client) PullImage(ctx context.Context, ref string) (io.ReadCloser, error) {
	return c.cli.ImagePull(ctx, ref, image.PullOptions{})
}

func (c *Client) CreateAndStartContainer(ctx context.Context, cfg *ContainerConfig) (string, error) {
	exposedPorts, portBindings, err := ParsePortMappings(cfg.Ports)
	if err != nil {
		return "", fmt.Errorf("parse ports: %w", err)
	}

	binds, mounts := splitVolumes(cfg.Volumes, cfg.DataDir, cfg.DataVolume)

	containerCfg := &container.Config{
		Image:        cfg.Image,
		Env:          cfg.Env,
		Labels:       cfg.Labels,
		ExposedPorts: exposedPorts,
		Cmd:          cfg.Cmd,
	}

	hostCfg := &container.HostConfig{
		Binds:        binds,
		Mounts:       mounts,
		CapAdd:       cfg.CapAdd,
		PortBindings: portBindings,
		Sysctls:      cfg.Sysctls,
	}

	if cfg.RestartPolicy != "" {
		hostCfg.RestartPolicy = container.RestartPolicy{Name: container.RestartPolicyMode(cfg.RestartPolicy)}
	}

	resp, err := c.cli.ContainerCreate(ctx, containerCfg, hostCfg, nil, nil, cfg.Name)
	if err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}
	if err := c.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		// Clean up the created container so it doesn't become an orphan
		_ = c.cli.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("start container: %w", err)
	}
	return resp.ID, nil
}

// splitVolumes separates volume specs into bind mounts and named volume mounts.
// Paths under dataDir are converted to named volume mounts with Subpath when
// dataVolume is set (Docker-in-Docker mode). Other paths remain as bind mounts.
func splitVolumes(volumes []string, dataDir, dataVolume string) ([]string, []mount.Mount) {
	if dataVolume == "" || dataDir == "" {
		return volumes, nil
	}

	prefix := strings.TrimSuffix(dataDir, "/") + "/"
	var binds []string
	var mounts []mount.Mount

	for _, v := range volumes {
		hostPath, target, readOnly := parseVolumeSpec(v)

		if strings.HasPrefix(hostPath, prefix) || hostPath == strings.TrimSuffix(dataDir, "/") {
			subpath := strings.TrimPrefix(hostPath, prefix)
			m := mount.Mount{
				Type:     mount.TypeVolume,
				Source:   dataVolume,
				Target:   target,
				ReadOnly: readOnly,
				VolumeOptions: &mount.VolumeOptions{
					Subpath: subpath,
				},
			}
			mounts = append(mounts, m)
		} else {
			binds = append(binds, v)
		}
	}

	return binds, mounts
}

// parseVolumeSpec splits "host:container[:ro]" into components.
func parseVolumeSpec(spec string) (hostPath, target string, readOnly bool) {
	parts := strings.SplitN(spec, ":", 3)
	switch len(parts) {
	case 1:
		return parts[0], parts[0], false
	case 2:
		return parts[0], parts[1], false
	default: // 3+
		return parts[0], parts[1], parts[2] == "ro"
	}
}

func (c *Client) RenameContainer(ctx context.Context, id string, newName string) error {
	return c.cli.ContainerRename(ctx, id, newName)
}

func (c *Client) ExecContainer(ctx context.Context, id string, cmd []string) (string, error) {
	execCfg := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	}
	execResp, err := c.cli.ContainerExecCreate(ctx, id, execCfg)
	if err != nil {
		return "", fmt.Errorf("exec create: %w", err)
	}
	attachResp, err := c.cli.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", fmt.Errorf("exec attach: %w", err)
	}
	defer attachResp.Close()
	output, err := io.ReadAll(attachResp.Reader)
	if err != nil {
		return "", fmt.Errorf("exec read: %w", err)
	}
	return string(output), nil
}

func (c *Client) ExecInteractive(ctx context.Context, id string, cmd []string) (*ExecSession, error) {
	execCfg := container.ExecOptions{
		Cmd:          cmd,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
	}
	execResp, err := c.cli.ContainerExecCreate(ctx, id, execCfg)
	if err != nil {
		return nil, fmt.Errorf("exec create: %w", err)
	}
	attachResp, err := c.cli.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{Tty: true})
	if err != nil {
		return nil, fmt.Errorf("exec attach: %w", err)
	}
	return &ExecSession{ID: execResp.ID, Conn: attachResp}, nil
}

func (c *Client) ResizeExec(ctx context.Context, execID string, height, width uint) error {
	return c.cli.ContainerExecResize(ctx, execID, container.ResizeOptions{
		Height: height,
		Width:  width,
	})
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.cli.Ping(ctx)
	return err
}

// ParsePortMappings parses "host:container[/proto]" port specs into Docker API types.
func ParsePortMappings(ports []string) (nat.PortSet, nat.PortMap, error) {
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	for _, p := range ports {
		proto := "tcp"
		spec := p

		// Extract protocol suffix
		if idx := strings.LastIndex(spec, "/"); idx != -1 {
			proto = spec[idx+1:]
			spec = spec[:idx]
		}

		parts := strings.SplitN(spec, ":", 2)
		if len(parts) != 2 {
			return nil, nil, fmt.Errorf("invalid port mapping %q: expected host:container", p)
		}

		hostPort := parts[0]
		containerPort := parts[1]

		natPort, err := nat.NewPort(proto, containerPort)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid port %q: %w", p, err)
		}

		exposedPorts[natPort] = struct{}{}
		portBindings[natPort] = []nat.PortBinding{
			{HostIP: "0.0.0.0", HostPort: hostPort},
		}
	}

	return exposedPorts, portBindings, nil
}
