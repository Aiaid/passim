package docker

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-connections/nat"
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

func TestParsePortMappings_TCP(t *testing.T) {
	exposed, bindings, err := ParsePortMappings([]string{"8080:80"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tcpPort, err := nat.NewPort("tcp", "80")
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := exposed[tcpPort]; !ok {
		t.Error("ExposedPorts missing 80/tcp")
	}

	b, ok := bindings[tcpPort]
	if !ok {
		t.Fatal("PortBindings missing 80/tcp")
	}
	if len(b) != 1 {
		t.Fatalf("expected 1 binding, got %d", len(b))
	}
	if b[0].HostIP != "0.0.0.0" {
		t.Errorf("HostIP = %q, want 0.0.0.0", b[0].HostIP)
	}
	if b[0].HostPort != "8080" {
		t.Errorf("HostPort = %q, want 8080", b[0].HostPort)
	}
}

func TestParsePortMappings_UDP(t *testing.T) {
	exposed, bindings, err := ParsePortMappings([]string{"51820:51820/udp"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	udpPort, err := nat.NewPort("udp", "51820")
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := exposed[udpPort]; !ok {
		t.Error("ExposedPorts missing 51820/udp")
	}

	b, ok := bindings[udpPort]
	if !ok {
		t.Fatal("PortBindings missing 51820/udp")
	}
	if len(b) != 1 {
		t.Fatalf("expected 1 binding, got %d", len(b))
	}
	if b[0].HostPort != "51820" {
		t.Errorf("HostPort = %q, want 51820", b[0].HostPort)
	}
}

func TestParsePortMappings_Multiple(t *testing.T) {
	exposed, bindings, err := ParsePortMappings([]string{"139:139", "445:445"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(exposed) != 2 {
		t.Errorf("expected 2 ExposedPorts, got %d", len(exposed))
	}
	if len(bindings) != 2 {
		t.Errorf("expected 2 PortBindings, got %d", len(bindings))
	}

	for _, port := range []string{"139", "445"} {
		natPort, _ := nat.NewPort("tcp", port)
		if _, ok := exposed[natPort]; !ok {
			t.Errorf("ExposedPorts missing %s/tcp", port)
		}
		b, ok := bindings[natPort]
		if !ok {
			t.Errorf("PortBindings missing %s/tcp", port)
		}
		if len(b) != 1 || b[0].HostPort != port {
			t.Errorf("HostPort for %s = %v, want %s", port, b, port)
		}
	}
}

func TestParsePortMappings_Empty(t *testing.T) {
	exposed, bindings, err := ParsePortMappings([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(exposed) != 0 {
		t.Errorf("expected empty ExposedPorts, got %d", len(exposed))
	}
	if len(bindings) != 0 {
		t.Errorf("expected empty PortBindings, got %d", len(bindings))
	}
}

func TestParsePortMappings_Invalid(t *testing.T) {
	_, _, err := ParsePortMappings([]string{"invalid"})
	if err == nil {
		t.Fatal("expected error for invalid port mapping, got nil")
	}
}

func TestMockClient_ExecContainer(t *testing.T) {
	mock := &MockClient{ExecOutput: "hello world"}

	output, err := mock.ExecContainer(context.Background(), "ctr-123", []string{"echo", "hello"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if output != "hello world" {
		t.Errorf("output = %q, want %q", output, "hello world")
	}
	if len(mock.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(mock.Calls))
	}
	if mock.Calls[0].Method != "ExecContainer" {
		t.Errorf("method = %q, want ExecContainer", mock.Calls[0].Method)
	}
	if mock.Calls[0].Args[0] != "ctr-123" {
		t.Errorf("arg[0] = %v, want ctr-123", mock.Calls[0].Args[0])
	}
	cmd, ok := mock.Calls[0].Args[1].([]string)
	if !ok {
		t.Fatalf("arg[1] is %T, want []string", mock.Calls[0].Args[1])
	}
	if len(cmd) != 2 || cmd[0] != "echo" || cmd[1] != "hello" {
		t.Errorf("cmd = %v, want [echo hello]", cmd)
	}
}

func TestMockClient_ExecContainer_Error(t *testing.T) {
	mock := &MockClient{ExecErr: errors.New("exec failed")}

	_, err := mock.ExecContainer(context.Background(), "ctr-123", []string{"fail"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Error() != "exec failed" {
		t.Errorf("error = %q, want %q", err.Error(), "exec failed")
	}
}

func TestSplitVolumes_NamedVolume(t *testing.T) {
	volumes := []string{"/data/apps/hy-abc/configs:/etc/hysteria", "/var/run/docker.sock:/var/run/docker.sock"}
	binds, mounts := splitVolumes(volumes, "/data", "passim_data", "")

	if len(binds) != 1 || binds[0] != "/var/run/docker.sock:/var/run/docker.sock" {
		t.Errorf("binds = %v, want docker.sock only", binds)
	}
	if len(mounts) != 1 {
		t.Fatalf("mounts count = %d, want 1", len(mounts))
	}
	if mounts[0].Source != "passim_data" {
		t.Errorf("mount source = %q, want passim_data", mounts[0].Source)
	}
	if mounts[0].VolumeOptions == nil || mounts[0].VolumeOptions.Subpath != "apps/hy-abc/configs" {
		t.Errorf("mount subpath = %v", mounts[0].VolumeOptions)
	}
}

func TestSplitVolumes_BindMount(t *testing.T) {
	volumes := []string{"/data/apps/hy-abc/configs:/etc/hysteria", "/var/run/docker.sock:/var/run/docker.sock"}
	binds, mounts := splitVolumes(volumes, "/data", "", "/opt/passim/data")

	if len(mounts) != 0 {
		t.Errorf("mounts should be empty for bind mount mode, got %d", len(mounts))
	}
	if len(binds) != 2 {
		t.Fatalf("binds count = %d, want 2", len(binds))
	}
	if binds[0] != "/opt/passim/data/apps/hy-abc/configs:/etc/hysteria" {
		t.Errorf("rewritten bind = %q, want /opt/passim/data/apps/hy-abc/configs:/etc/hysteria", binds[0])
	}
	if binds[1] != "/var/run/docker.sock:/var/run/docker.sock" {
		t.Errorf("non-data bind = %q", binds[1])
	}
}

func TestSplitVolumes_NoDocker(t *testing.T) {
	volumes := []string{"/data/apps/hy-abc/configs:/etc/hysteria"}
	binds, mounts := splitVolumes(volumes, "/data", "", "")

	if len(mounts) != 0 {
		t.Error("expected no mounts in non-Docker mode")
	}
	if len(binds) != 1 || binds[0] != volumes[0] {
		t.Errorf("expected volumes passed through unchanged, got %v", binds)
	}
}
