package docker

import (
	"context"
	"io"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
)

// MockCall records a method call for verification in tests.
type MockCall struct {
	Method string
	Args   []interface{}
}

// MockClient implements DockerClient for testing.
type MockClient struct {
	mu    sync.Mutex
	Calls []MockCall

	// Configurable return values
	Containers      []container.Summary
	ListErr         error
	StartErr        error
	StopErr         error
	RestartErr      error
	RemoveErr       error
	InspectResult   types.ContainerJSON
	InspectErr      error
	LogsReader      io.ReadCloser
	LogsErr         error
	PullReader      io.ReadCloser
	PullErr         error
	CreateID        string
	CreateErr       error
	RenameErr       error
	ExecOutput             string
	ExecErr                error
	ExecInteractiveResult  *ExecSession
	ExecInteractiveErr     error
	ResizeExecErr          error
	PingErr                error

	// Phase 2+ stack primitives
	ExistingNetworks  map[string]struct{}
	ExistingVolumes   map[string]struct{}
	CreateNetworkErr  error
	NetworkExistsErr  error
	RemoveNetworkErr  error
	CreateVolumeErr   error
	VolumeExistsErr   error
	RemoveVolumeErr   error
}

func (m *MockClient) record(method string, args ...interface{}) {
	m.mu.Lock()
	m.Calls = append(m.Calls, MockCall{Method: method, Args: args})
	m.mu.Unlock()
}

// GetCalls returns a snapshot of recorded calls (thread-safe).
func (m *MockClient) GetCalls() []MockCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]MockCall, len(m.Calls))
	copy(cp, m.Calls)
	return cp
}

func (m *MockClient) ListContainers(ctx context.Context) ([]container.Summary, error) {
	m.record("ListContainers")
	return m.Containers, m.ListErr
}

func (m *MockClient) StartContainer(ctx context.Context, id string) error {
	m.record("StartContainer", id)
	return m.StartErr
}

func (m *MockClient) StopContainer(ctx context.Context, id string) error {
	m.record("StopContainer", id)
	return m.StopErr
}

func (m *MockClient) RestartContainer(ctx context.Context, id string) error {
	m.record("RestartContainer", id)
	return m.RestartErr
}

func (m *MockClient) RemoveContainer(ctx context.Context, id string) error {
	m.record("RemoveContainer", id)
	return m.RemoveErr
}

func (m *MockClient) InspectContainer(ctx context.Context, id string) (types.ContainerJSON, error) {
	m.record("InspectContainer", id)
	return m.InspectResult, m.InspectErr
}

func (m *MockClient) ContainerLogs(ctx context.Context, id string, lines int) (io.ReadCloser, error) {
	m.record("ContainerLogs", id, lines)
	return m.LogsReader, m.LogsErr
}

func (m *MockClient) ContainerLogsFollow(ctx context.Context, id string, lines int) (io.ReadCloser, error) {
	m.record("ContainerLogsFollow", id, lines)
	return m.LogsReader, m.LogsErr
}

func (m *MockClient) PullImage(ctx context.Context, ref string) (io.ReadCloser, error) {
	m.record("PullImage", ref)
	return m.PullReader, m.PullErr
}

func (m *MockClient) CreateAndStartContainer(ctx context.Context, cfg *ContainerConfig) (string, error) {
	m.record("CreateAndStartContainer", cfg)
	return m.CreateID, m.CreateErr
}

func (m *MockClient) RenameContainer(ctx context.Context, id string, newName string) error {
	m.record("RenameContainer", id, newName)
	return m.RenameErr
}

func (m *MockClient) ExecContainer(ctx context.Context, id string, cmd []string) (string, error) {
	m.record("ExecContainer", id, cmd)
	return m.ExecOutput, m.ExecErr
}

func (m *MockClient) ExecInteractive(ctx context.Context, id string, cmd []string) (*ExecSession, error) {
	m.record("ExecInteractive", id, cmd)
	return m.ExecInteractiveResult, m.ExecInteractiveErr
}

func (m *MockClient) ResizeExec(ctx context.Context, execID string, height, width uint) error {
	m.record("ResizeExec", execID, height, width)
	return m.ResizeExecErr
}

func (m *MockClient) EnsureNetwork(ctx context.Context, name string) error {
	m.record("EnsureNetwork", name)
	return nil
}

func (m *MockClient) ConnectNetwork(ctx context.Context, networkName, containerID string, aliases []string) error {
	m.record("ConnectNetwork", networkName, containerID, aliases)
	return nil
}

func (m *MockClient) Ping(ctx context.Context) error {
	m.record("Ping")
	return m.PingErr
}

func (m *MockClient) Close() error {
	m.record("Close")
	return nil
}

// Phase 2+ stack primitives. Mocks default to no-op success; tests that need
// failure semantics should set specific *Err fields.
//
//nolint:revive // allow name-shadow on Opts in tests
func (m *MockClient) CreateNetwork(ctx context.Context, name string, opts NetworkCreateOpts) error {
	m.record("CreateNetwork", name, opts)
	return m.CreateNetworkErr
}

func (m *MockClient) NetworkExists(ctx context.Context, name string) (bool, error) {
	m.record("NetworkExists", name)
	if m.NetworkExistsErr != nil {
		return false, m.NetworkExistsErr
	}
	_, ok := m.ExistingNetworks[name]
	return ok, nil
}

func (m *MockClient) RemoveNetwork(ctx context.Context, name string) error {
	m.record("RemoveNetwork", name)
	return m.RemoveNetworkErr
}

func (m *MockClient) CreateVolume(ctx context.Context, name string, opts VolumeCreateOpts) error {
	m.record("CreateVolume", name, opts)
	return m.CreateVolumeErr
}

func (m *MockClient) VolumeExists(ctx context.Context, name string) (bool, error) {
	m.record("VolumeExists", name)
	if m.VolumeExistsErr != nil {
		return false, m.VolumeExistsErr
	}
	_, ok := m.ExistingVolumes[name]
	return ok, nil
}

func (m *MockClient) RemoveVolume(ctx context.Context, name string) error {
	m.record("RemoveVolume", name)
	return m.RemoveVolumeErr
}
