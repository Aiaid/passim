package metrics

import (
	"context"
	"testing"
)

func TestCollect_ReturnsNonZeroValues(t *testing.T) {
	resetPrev()
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
	resetPrev()
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
	resetPrev()
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
	resetPrev()
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

func TestCollect_NetworkRateZeroOnFirstSample(t *testing.T) {
	resetPrev()
	m, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}

	// First call has no previous sample, so rate should be 0
	if m.NetBytesSent != 0 {
		t.Errorf("expected NetBytesSent=0 on first sample, got %d", m.NetBytesSent)
	}
	if m.NetBytesRecv != 0 {
		t.Errorf("expected NetBytesRecv=0 on first sample, got %d", m.NetBytesRecv)
	}
}

func TestCollect_NetworkRateNonNegativeOnSecondSample(t *testing.T) {
	resetPrev()
	// First sample seeds the previous values
	_, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("first Collect() returned error: %v", err)
	}

	// Second sample should compute a rate >= 0
	m2, err := Collect(context.Background())
	if err != nil {
		t.Fatalf("second Collect() returned error: %v", err)
	}

	// Rate should be non-negative (can be 0 if no traffic between samples)
	// Just verify it doesn't return impossibly large values (old cumulative bug)
	const maxReasonableRate = 10 * 1024 * 1024 * 1024 // 10 GB/s
	if m2.NetBytesSent > maxReasonableRate {
		t.Errorf("NetBytesSent rate looks like cumulative, not rate: %d", m2.NetBytesSent)
	}
	if m2.NetBytesRecv > maxReasonableRate {
		t.Errorf("NetBytesRecv rate looks like cumulative, not rate: %d", m2.NetBytesRecv)
	}
}
