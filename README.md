# Passim

Your VPS, your way. No terminal required.

Passim is a personal cloud management assistant for ordinary people. One `docker run` command, open a browser, deploy VPN / file storage / remote desktop — without touching a terminal, writing config files, or understanding Docker.

## Features

- **One command to start** — `docker run` and you're done, no second step
- **One-click app deploy** — WireGuard, L2TP, Hysteria, V2Ray, WebDAV, Samba, Remote Desktop
- **Multi-node management** — manage all your VPS instances from any single Passim node
- **Built-in SSL** — automatic Let's Encrypt, self-signed fallback, or custom certificate upload
- **Built-in speed test** — browser-based HTTP speed test + iperf3 for node-to-node throughput
- **Real-time monitoring** — CPU, memory, disk, network via SSE streaming
- **Passkey login** — WebAuthn/FIDO2 biometric authentication alongside API Key
- **Self-update** — update to new versions from the Web UI, with automatic rollback on failure
- **i18n** — English and Simplified Chinese

## Quick Start

**One-line install** (installs Docker if needed, sets up HTTPS via DNS reflector automatically):

```bash
curl -fsSL https://raw.githubusercontent.com/anend-s-cat/passim/main/install.sh | sudo bash
```

The script auto-detects your public IP, obtains a Let's Encrypt certificate via DNS reflector (`dns.passim.io`) — no domain required. An API key is auto-generated on first run and printed to the terminal.

**Or run manually:**

```bash
docker run -d \
  --name passim \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v passim-data:/data \
  -p 8443:8443 \
  -p 80:80 \
  -e SSL_MODE=letsencrypt \
  -e DNS_BASE_DOMAIN=dns.passim.io \
  ghcr.io/anend-s-cat/passim:latest
```

Open `https://<your-ip>:8443` in your browser. Find the auto-generated API key in the container logs:

```bash
docker logs passim
```

### Install Script Options

```
--port PORT         Listen port (default: 8443)
--api-key KEY       Pre-set API key (default: auto-generated)
--ssl MODE          SSL mode: self-signed | letsencrypt | off (default: letsencrypt)
--dns-domain DOMAIN DNS reflector base domain (default: dns.passim.io)
--domain DOMAIN     Your own domain for Let's Encrypt
--email EMAIL       Email for Let's Encrypt
--data-dir DIR      Host data directory (default: /opt/passim/data)
--image TAG         Image tag (default: latest)
--skip-docker       Skip Docker installation
--uninstall         Remove Passim container and data
```

**Have your own domain?** Use `--domain` to skip DNS reflector:

```bash
curl -fsSL https://raw.githubusercontent.com/anend-s-cat/passim/main/install.sh | \
  sudo bash -s -- --domain example.com --email you@example.com
```

### Ports

| Port | Purpose |
|------|---------|
| `8443` | HTTPS Web UI + API |
| `80` | ACME HTTP-01 certificate validation + HTTP → HTTPS redirect |
| `5201` | iperf3 speed test (node-to-node) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8443` | Listen port |
| `API_KEY` | *(auto-generated)* | Pre-set API key; omit to auto-generate on first run |
| `SSL_MODE` | `letsencrypt` | `self-signed` / `letsencrypt` / `off` |
| `SSL_DOMAIN` | — | Your own domain for Let's Encrypt (highest priority) |
| `SSL_EMAIL` | — | Contact email for Let's Encrypt |
| `DNS_BASE_DOMAIN` | `dns.passim.io` | DNS reflector base domain; auto-discovers public IP when `SSL_DOMAIN` is not set |
| `DATA_DIR` | `/data` | Persistent data directory |

### Volumes

| Path | Description |
|------|-------------|
| `/var/run/docker.sock` | Docker Engine socket (required) |
| `/data` | SQLite database, app configs, SSL certificates |

## Multi-Node

Every Passim instance is equal. Any node can connect to and manage other nodes — no central server, no extra deployment.

```
VPS A                         VPS B
┌──────────────┐              ┌──────────────┐
│   Passim     │◄════════════►│   Passim     │
│              │  WebSocket   │              │
│ manages: A,B │              │ manages: B   │
└──────────────┘              └──────────────┘
```

Add a remote node from the Web UI: enter the address and API key, done.

## App Templates

Apps are defined as YAML templates. Deploy from the Web UI with a guided wizard — no Docker knowledge needed.

| App | Category | Description |
|-----|----------|-------------|
| WireGuard | VPN | Peer-to-peer VPN |
| L2TP/IPSec | VPN | Classic VPN, works on all devices |
| Hysteria | Proxy | High-speed UDP proxy |
| V2Ray | Proxy | Versatile proxy platform |
| WebDAV | Storage | File access over HTTP |
| Samba | Storage | Windows-compatible file sharing |
| RDesktop | Remote | Remote desktop access |

## Architecture

Single Go binary with embedded Web UI, packaged in one Docker container.

```
┌─────────────────────────────────────────┐
│              Go Binary                  │
│                                         │
│  HTTP API (Gin)  ·  Static SPA  ·  WS  │
│         │                         │     │
│  ┌──────┴─────────────────────────┴──┐  │
│  │           Core Engine             │  │
│  │  Docker · Templates · Metrics     │  │
│  │  Tasks  · Nodes     · Auth        │  │
│  │  SSL    · Speedtest · Update      │  │
│  └───────────────┬───────────────────┘  │
│           SQLite (WAL)                  │
└─────────────────────────────────────────┘
        │
        ▼ docker.sock
   [Docker Engine]
```

**Tech stack:**

- **Backend:** Go 1.25 · Gin · SQLite (WAL) · Docker SDK · gopsutil · autocert
- **Frontend:** Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query
- **CI/CD:** GitHub Actions · Multi-arch Docker images (amd64 + arm64) · GHCR

## Development

### Prerequisites

- Go 1.25+
- Node.js 22+ with pnpm
- Docker

### Backend

```bash
cd passim
go run ./cmd/passim/          # Dev server on :8443
go test ./...                 # Run all tests
go test -race -cover ./...    # With race detection and coverage
```

### Frontend

```bash
cd web
pnpm install
pnpm dev                      # Vite dev server
pnpm test                     # Vitest
pnpm lint                     # ESLint
pnpm tsc -b                   # Type check
```

### Docker Build

```bash
# Build from repo root
docker build -f passim/Dockerfile .

# Build with version
docker build \
  --build-arg VERSION=v1.0.0 \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  -f passim/Dockerfile .
```

## Release

Tags trigger the release pipeline:

```bash
git tag -a v1.0.0 -m "release: v1.0.0"
git push origin v1.0.0
# → CI builds multi-arch images → pushes to ghcr.io/anend-s-cat/passim
# → Creates GitHub Release with changelog + install instructions
```

## License

All rights reserved.
