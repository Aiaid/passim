package docker

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestMockClient_ImplementsInterface(t *testing.T) {
	var _ DockerClient = &MockClient{}
}

func TestMockClient_ListContainers(t *testing.T) {
	mock := &MockClient{
		Containers: []container.Summary{
			{ID: "abc123", State: "running"},
			{ID: "def456", State: "exited"},
		},
	}

	containers, err := mock.ListContainers(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(containers) != 2 {
		t.Fatalf("expected 2 containers, got %d", len(containers))
	}
	if containers[0].ID != "abc123" {
		t.Errorf("expected container ID abc123, got %s", containers[0].ID)
	}
	if len(mock.Calls) != 1 || mock.Calls[0].Method != "ListContainers" {
		t.Error("expected ListContainers call to be recorded")
	}
}

func TestMockClient_ListContainers_Error(t *testing.T) {
	mock := &MockClient{
		ListErr: errors.New("connection refused"),
	}

	_, err := mock.ListContainers(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Error() != "connection refused" {
		t.Errorf("expected 'connection refused', got %q", err.Error())
	}
}

func TestMockClient_StartContainer(t *testing.T) {
	mock := &MockClient{}

	err := mock.StartContainer(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.Calls) != 1 {
		t.Fatal("expected 1 call recorded")
	}
	if mock.Calls[0].Method != "StartContainer" {
		t.Errorf("expected StartContainer, got %s", mock.Calls[0].Method)
	}
	if mock.Calls[0].Args[0] != "abc123" {
		t.Errorf("expected arg abc123, got %v", mock.Calls[0].Args[0])
	}
}

func TestMockClient_StopContainer(t *testing.T) {
	mock := &MockClient{}

	err := mock.StopContainer(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.Calls) != 1 || mock.Calls[0].Method != "StopContainer" {
		t.Error("expected StopContainer call recorded")
	}
}

func TestMockClient_RestartContainer(t *testing.T) {
	mock := &MockClient{}

	err := mock.RestartContainer(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.Calls) != 1 || mock.Calls[0].Method != "RestartContainer" {
		t.Error("expected RestartContainer call recorded")
	}
}

func TestMockClient_RemoveContainer(t *testing.T) {
	mock := &MockClient{}

	err := mock.RemoveContainer(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.Calls) != 1 || mock.Calls[0].Method != "RemoveContainer" {
		t.Error("expected RemoveContainer call recorded")
	}
}

func TestMockClient_ContainerLogs(t *testing.T) {
	mock := &MockClient{
		LogsReader: io.NopCloser(strings.NewReader("line1\nline2\n")),
	}

	reader, err := mock.ContainerLogs(context.Background(), "abc123", 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer reader.Close()

	data, _ := io.ReadAll(reader)
	if string(data) != "line1\nline2\n" {
		t.Errorf("unexpected log content: %q", string(data))
	}
}

func TestMockClient_Ping(t *testing.T) {
	mock := &MockClient{}

	if err := mock.Ping(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mock.PingErr = errors.New("not reachable")
	if err := mock.Ping(context.Background()); err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestMockClient_Close(t *testing.T) {
	mock := &MockClient{}

	if err := mock.Close(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.Calls) != 1 || mock.Calls[0].Method != "Close" {
		t.Error("expected Close call recorded")
	}
}
