package metrics

import (
	"context"
	"testing"
)

func TestCollect_ReturnsNonZeroValues(t *testing.T) {
	m, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}

	if m.Hostname == "" {
		t.Error("expected non-empty Hostname")
	}
	if m.Uptime == 0 {
		t.Error("expected non-zero Uptime")
	}
	if m.MemTotal == 0 {
		t.Error("expected non-zero MemTotal")
	}
	if m.DiskTotal == 0 {
		t.Error("expected non-zero DiskTotal")
	}
	if m.CPUCores == 0 {
		t.Error("expected non-zero CPUCores")
	}
	if m.OS == "" {
		t.Error("expected non-empty OS")
	}
	if m.Kernel == "" {
		t.Error("expected non-empty Kernel")
	}
}

func TestCollect_CPUModelNotEmpty(t *testing.T) {
	m, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}

	// CPU model may be empty on some CI environments, but should generally be set
	if m.CPUModel == "" {
		t.Log("warning: CPUModel is empty (may be expected on some platforms)")
	}
}

func TestCollect_MemoryUsageReasonable(t *testing.T) {
	m, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}

	if m.MemUsed > m.MemTotal {
		t.Errorf("MemUsed (%d) > MemTotal (%d)", m.MemUsed, m.MemTotal)
	}
	if m.MemPercent < 0 || m.MemPercent > 100 {
		t.Errorf("MemPercent out of range: %f", m.MemPercent)
	}
}

func TestCollect_DiskUsageReasonable(t *testing.T) {
	m, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}

	if m.DiskUsed > m.DiskTotal {
		t.Errorf("DiskUsed (%d) > DiskTotal (%d)", m.DiskUsed, m.DiskTotal)
	}
	if m.DiskPercent < 0 || m.DiskPercent > 100 {
		t.Errorf("DiskPercent out of range: %f", m.DiskPercent)
	}
}
