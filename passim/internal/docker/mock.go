package docker

import (
	"context"
	"io"

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
	ExecOutput      string
	ExecErr         error
	PingErr         error
}

func (m *MockClient) record(method string, args ...interface{}) {
	m.Calls = append(m.Calls, MockCall{Method: method, Args: args})
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

func (m *MockClient) Ping(ctx context.Context) error {
	m.record("Ping")
	return m.PingErr
}

func (m *MockClient) Close() error {
	m.record("Close")
	return nil
}
