#!/usr/bin/env python3
"""Generate preview PNGs for all three layout densities."""
from main import render_single, render_cluster

# ── Mock data ──────────────────────────────────────────────

def mock_status(name="Home", country="US", uptime=180000):
    return {
        "node": {
            "id": "abc123", "name": name, "version": "v0.7.0",
            "uptime": uptime, "public_ip": "203.0.113.42",
            "country": country, "latitude": 37.7, "longitude": -122.4,
        },
        "system": {
            "cpu": {"usage_percent": 45.2, "cores": 4, "model": "ARM Cortex-A72"},
            "memory": {"total_bytes": 4_123_456_789, "used_bytes": 2_567_890_123, "usage_percent": 62.3},
            "disk": {"total_bytes": 64_000_000_000, "used_bytes": 24_320_000_000, "usage_percent": 38.0},
            "network": {"rx_rate": 1_258_000, "tx_rate": 312_000},
            "load": {"load1": 1.2, "load5": 0.8, "load15": 0.6},
            "os": "linux", "kernel": "6.1.0",
        },
        "containers": {"running": 5, "stopped": 2, "total": 7},
    }


def mock_node(name, country, cpu, mem, running, total, online=True):
    n = {"name": name, "country": country}
    if online:
        n["status"] = "connected"
        n["metrics"] = {
            "cpu_percent": cpu, "memory_percent": mem, "disk_percent": 40,
            "containers": {"running": running, "total": total},
        }
    else:
        n["status"] = "disconnected"
    return n


# ── 1) Single node (0 remotes) ────────────────────────────
img1 = render_single(mock_status())
img1.save("/Users/anend/Desktop/quote0_1_single.png")

# ── 2) Expanded (2 nodes total) ───────────────────────────
img2 = render_cluster(mock_status(), [
    mock_node("Tokyo", "JP", 12.5, 38.0, 2, 3),
])
img2.save("/Users/anend/Desktop/quote0_2_expanded.png")

# ── 3) Medium (4 nodes total) ─────────────────────────────
img3 = render_cluster(mock_status(), [
    mock_node("Tokyo", "JP", 12.5, 38.0, 2, 3),
    mock_node("London", "GB", 78.3, 55.1, 3, 4),
    mock_node("Berlin", "DE", 0, 0, 0, 0, online=False),
])
img3.save("/Users/anend/Desktop/quote0_3_medium.png")

# ── 4) Compact (6 nodes total) ────────────────────────────
img4 = render_cluster(mock_status(), [
    mock_node("Tokyo", "JP", 12.5, 38.0, 2, 3),
    mock_node("London", "GB", 78.3, 55.1, 3, 4),
    mock_node("Sydney", "AU", 23.0, 41.2, 1, 2),
    mock_node("Berlin", "DE", 0, 0, 0, 0, online=False),
    mock_node("Seoul", "KR", 55.0, 72.3, 4, 5),
])
img4.save("/Users/anend/Desktop/quote0_4_compact.png")

print("Done! 4 previews saved to Desktop:")
print("  quote0_1_single.png     — 1 node")
print("  quote0_2_expanded.png   — 2 nodes")
print("  quote0_3_medium.png     — 4 nodes")
print("  quote0_4_compact.png    — 6 nodes")
