package metrics

import (
	"context"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

type SystemMetrics struct {
	Hostname     string  `json:"hostname"`
	Uptime       uint64  `json:"uptime"`
	CPUPercent   float64 `json:"cpu_percent"`
	CPUCores     int     `json:"cpu_cores"`
	CPUModel     string  `json:"cpu_model"`
	MemTotal     uint64  `json:"mem_total"`
	MemUsed      uint64  `json:"mem_used"`
	MemPercent   float64 `json:"mem_percent"`
	DiskTotal    uint64  `json:"disk_total"`
	DiskUsed     uint64  `json:"disk_used"`
	DiskPercent  float64 `json:"disk_percent"`
	Load1        float64 `json:"load_1"`
	Load5        float64 `json:"load_5"`
	Load15       float64 `json:"load_15"`
	NetBytesSent uint64  `json:"net_bytes_sent"` // rate: bytes/s
	NetBytesRecv uint64  `json:"net_bytes_recv"` // rate: bytes/s
	OS           string  `json:"os"`
	Kernel       string  `json:"kernel"`
}

var (
	prevMu       sync.Mutex
	prevTime     time.Time
	prevSent     uint64
	prevRecv     uint64
	prevHasValue bool
)

// resetPrev resets the previous sample state (for testing).
func resetPrev() {
	prevMu.Lock()
	prevHasValue = false
	prevSent = 0
	prevRecv = 0
	prevTime = time.Time{}
	prevMu.Unlock()
}

func Collect(ctx context.Context) (*SystemMetrics, error) {
	m := &SystemMetrics{}

	if info, err := host.InfoWithContext(ctx); err == nil {
		m.Hostname = info.Hostname
		m.Uptime = info.Uptime
		m.OS = info.OS
		m.Kernel = info.KernelVersion
	}

	if percents, err := cpu.PercentWithContext(ctx, time.Second, false); err == nil && len(percents) > 0 {
		m.CPUPercent = percents[0]
	}

	if counts, err := cpu.CountsWithContext(ctx, true); err == nil {
		m.CPUCores = counts
	}

	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		m.CPUModel = infos[0].ModelName
	}

	if v, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		m.MemTotal = v.Total
		m.MemUsed = v.Used
		m.MemPercent = v.UsedPercent
	}

	if d, err := disk.UsageWithContext(ctx, "/"); err == nil {
		m.DiskTotal = d.Total
		m.DiskUsed = d.Used
		m.DiskPercent = d.UsedPercent
	}

	if l, err := load.AvgWithContext(ctx); err == nil {
		m.Load1 = l.Load1
		m.Load5 = l.Load5
		m.Load15 = l.Load15
	}

	if counters, err := net.IOCountersWithContext(ctx, false); err == nil && len(counters) > 0 {
		now := time.Now()
		sent := counters[0].BytesSent
		recv := counters[0].BytesRecv

		prevMu.Lock()
		if prevHasValue {
			dt := now.Sub(prevTime).Seconds()
			if dt > 0 {
				m.NetBytesSent = uint64(float64(sent-prevSent) / dt)
				m.NetBytesRecv = uint64(float64(recv-prevRecv) / dt)
			}
		}
		prevTime = now
		prevSent = sent
		prevRecv = recv
		prevHasValue = true
		prevMu.Unlock()
	}

	return m, nil
}
