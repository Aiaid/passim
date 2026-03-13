package docker

import (
	"context"
	"fmt"
	"io"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

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
	Ping(ctx context.Context) error
	Close() error
}

// ContainerConfig holds the configuration for creating a new container.
type ContainerConfig struct {
	Name       string
	Image      string
	Env        []string
	Ports      []string // "host:container" format
	Volumes    []string // "host:container" format
	Labels     map[string]string
	CapAdd     []string
	RestartPolicy string
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
	resp, err := c.cli.ContainerCreate(ctx, &container.Config{
		Image:  cfg.Image,
		Env:    cfg.Env,
		Labels: cfg.Labels,
	}, &container.HostConfig{
		Binds:  cfg.Volumes,
		CapAdd: cfg.CapAdd,
	}, nil, nil, cfg.Name)
	if err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}
	if err := c.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return "", fmt.Errorf("start container: %w", err)
	}
	return resp.ID, nil
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.cli.Ping(ctx)
	return err
}
