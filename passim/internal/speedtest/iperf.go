package speedtest

import (
	"fmt"
	"os/exec"
	"sync"
)

// IperfServer manages an iperf3 server process.
type IperfServer struct {
	mu   sync.Mutex
	cmd  *exec.Cmd
	port string
}

// NewIperfServer creates a new IperfServer that will listen on the given port.
func NewIperfServer(port string) *IperfServer {
	if port == "" {
		port = "5201"
	}
	return &IperfServer{port: port}
}

// Start launches the iperf3 server process.
func (s *IperfServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		return fmt.Errorf("iperf3 already running")
	}

	path, err := exec.LookPath("iperf3")
	if err != nil {
		return fmt.Errorf("iperf3 not found: %w", err)
	}

	s.cmd = exec.Command(path, "-s", "-p", s.port)
	if err := s.cmd.Start(); err != nil {
		s.cmd = nil
		return fmt.Errorf("start iperf3: %w", err)
	}

	return nil
}

// Stop kills the iperf3 server process.
func (s *IperfServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd == nil || s.cmd.Process == nil {
		return nil
	}

	err := s.cmd.Process.Kill()
	s.cmd = nil
	if err != nil {
		return fmt.Errorf("kill iperf3: %w", err)
	}
	return nil
}

// Status returns the current state of the iperf3 server.
// Possible values: "ready", "stopped", "unavailable".
func (s *IperfServer) Status() string {
	if _, err := exec.LookPath("iperf3"); err != nil {
		return "unavailable"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		return "ready"
	}
	return "stopped"
}
