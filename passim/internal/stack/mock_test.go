package stack

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"
	"sync/atomic"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/passim/passim/internal/docker"
)

// dockerMock is a lightweight docker.DockerClient used by deployer tests.
// Unlike docker.MockClient it tracks side effects (created networks, pulls,
// containers, rollback calls) so tests can assert on all-or-nothing
// semantics without mocking out the full interface.
type dockerMock struct {
	mu                 sync.Mutex
	pulled             []string
	createdNetworks    []string
	removedNetworks    int
	createdVolumes     []string
	removedVolumes     int
	createdContainers  []string
	removedContainers  int
	createdContainerID string
	connects           []connectCall
	existingNetworks   map[string]struct{}
	existingVolumes    map[string]struct{}

	// Induce failures after N successful calls to test rollback paths.
	createErrAfter int32
	createCount    atomic.Int32
}

type connectCall struct {
	network, container string
	aliases            []string
}

func (m *dockerMock) ListContainers(ctx context.Context) ([]container.Summary, error) {
	return nil, nil
}
func (m *dockerMock) StartContainer(ctx context.Context, id string) error { return nil }
func (m *dockerMock) StopContainer(ctx context.Context, id string) error  { return nil }
func (m *dockerMock) RestartContainer(ctx context.Context, id string) error {
	return nil
}
func (m *dockerMock) RemoveContainer(ctx context.Context, id string) error {
	m.mu.Lock()
	m.removedContainers++
	m.mu.Unlock()
	return nil
}
func (m *dockerMock) InspectContainer(ctx context.Context, id string) (types.ContainerJSON, error) {
	return types.ContainerJSON{}, nil
}
func (m *dockerMock) ContainerLogs(ctx context.Context, id string, lines int) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(nil)), nil
}
func (m *dockerMock) ContainerLogsFollow(ctx context.Context, id string, lines int) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(nil)), nil
}
func (m *dockerMock) PullImage(ctx context.Context, ref string) (io.ReadCloser, error) {
	m.mu.Lock()
	m.pulled = append(m.pulled, ref)
	m.mu.Unlock()
	return io.NopCloser(bytes.NewReader(nil)), nil
}

func (m *dockerMock) CreateAndStartContainer(ctx context.Context, cfg *docker.ContainerConfig) (string, error) {
	n := m.createCount.Add(1)
	if m.createErrAfter > 0 && n > m.createErrAfter {
		return "", fmt.Errorf("injected failure on container %d", n)
	}
	m.mu.Lock()
	m.createdContainers = append(m.createdContainers, cfg.Name)
	m.mu.Unlock()
	id := m.createdContainerID
	if id == "" {
		id = fmt.Sprintf("c%d", n)
	}
	return id, nil
}

func (m *dockerMock) RenameContainer(ctx context.Context, id, newName string) error { return nil }
func (m *dockerMock) ExecContainer(ctx context.Context, id string, cmd []string) (string, error) {
	return "", nil
}
func (m *dockerMock) ExecInteractive(ctx context.Context, id string, cmd []string) (*docker.ExecSession, error) {
	return nil, nil
}
func (m *dockerMock) ResizeExec(ctx context.Context, id string, h, w uint) error { return nil }
func (m *dockerMock) EnsureNetwork(ctx context.Context, name string) error       { return nil }
func (m *dockerMock) ConnectNetwork(ctx context.Context, net, cid string, aliases []string) error {
	m.mu.Lock()
	m.connects = append(m.connects, connectCall{network: net, container: cid, aliases: aliases})
	m.mu.Unlock()
	return nil
}
func (m *dockerMock) Ping(ctx context.Context) error { return nil }
func (m *dockerMock) Close() error                   { return nil }

func (m *dockerMock) CreateNetwork(ctx context.Context, name string, opts docker.NetworkCreateOpts) error {
	m.mu.Lock()
	m.createdNetworks = append(m.createdNetworks, name)
	m.mu.Unlock()
	return nil
}
func (m *dockerMock) NetworkExists(ctx context.Context, name string) (bool, error) {
	_, ok := m.existingNetworks[name]
	return ok, nil
}
func (m *dockerMock) RemoveNetwork(ctx context.Context, name string) error {
	m.mu.Lock()
	m.removedNetworks++
	m.mu.Unlock()
	return nil
}
func (m *dockerMock) CreateVolume(ctx context.Context, name string, opts docker.VolumeCreateOpts) error {
	m.mu.Lock()
	m.createdVolumes = append(m.createdVolumes, name)
	m.mu.Unlock()
	return nil
}
func (m *dockerMock) VolumeExists(ctx context.Context, name string) (bool, error) {
	_, ok := m.existingVolumes[name]
	return ok, nil
}
func (m *dockerMock) RemoveVolume(ctx context.Context, name string) error {
	m.mu.Lock()
	m.removedVolumes++
	m.mu.Unlock()
	return nil
}

func (m *dockerMock) ListNetworksByLabel(ctx context.Context, key, value string) ([]string, error) {
	return nil, nil
}

func (m *dockerMock) ListVolumesByLabel(ctx context.Context, key, value string) ([]string, error) {
	return nil, nil
}
