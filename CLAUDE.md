# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AC (Passim) is a personal cloud management assistant for ordinary people — like Portainer, but designed with taste and simplicity for non-technical users. One `docker run` command, open a browser, deploy VPN/storage/remote desktop without touching a terminal.

Full rewrite in progress: legacy multi-component architecture → single Go binary with embedded Web UI. See `Doc/rewrite-plan.md` for details.

## Monorepo Structure

| Directory | Description | Status |
|-----------|-------------|--------|
| `passim/` | Go backend (Gin + SQLite + Docker SDK) | Active — Phase 4 |
| `web/` | Vite + React 19 + shadcn/ui frontend | Complete — Phase 2 |
| `.github/` | GitHub Actions CI/CD workflows | Active |
| `app/` | Expo mobile app (iOS + Android) | Planned — Phase 5 |
| `DNS/` | Python nserver DNS server (kept as-is) | Maintained |
| `Doc/` | Design docs, specs, user stories | Active |
| `_legacy/` | Old code (Web/Passim/Updater/IoC/FIlestash) | Archived |

## Development Workflow

**All changes MUST follow this order:**

1. **Doc first** — Update or create the relevant spec/story in `Doc/` before writing any code. If the change touches API, schema, or architecture, the doc update is mandatory.
2. **Code** — Implement the change.
3. **Test** — Write and run tests. Code without tests is not considered complete.

## Testing Requirements

Every code change must include appropriate tests. No exceptions.

### Go Backend (`passim/`)

```bash
cd passim
go test ./...                    # Run all tests
go test ./internal/auth/...      # Run specific package tests
go test -race ./...              # Race condition detection
go test -cover ./...             # Coverage report
```

**Unit tests** — Test individual functions and methods in isolation. Use table-driven tests. Mock external dependencies (Docker SDK, filesystem). Place test files alongside source: `foo.go` → `foo_test.go`.

**Integration tests** — Test interactions between packages (API → DB, API → Docker). Use a real SQLite database (in-memory or temp file). Use build tag `//go:build integration`. Place in `_test.go` files or `testdata/` directories.

**E2E tests** — Test full HTTP request/response cycles against a running server. Start a real Gin server on a random port, hit actual endpoints, verify responses. Use build tag `//go:build e2e`.

```bash
go test -tags=integration ./...  # Run integration tests
go test -tags=e2e ./...          # Run E2E tests
```

### Web Frontend (`web/`) — Phase 2

Unit tests: Vitest + React Testing Library
E2E tests: Playwright

### Mobile App (`app/`) — Phase 5

Unit tests: Jest + React Native Testing Library

## Common Commands

### Passim (Go Backend)
```bash
cd passim
go run ./cmd/passim/             # Dev server on :8443
go build ./cmd/passim/           # Build binary
go test ./...                    # All tests
go test -cover ./...             # Coverage
./passim --version               # Show version info
```

### DNS Server
```bash
cd DNS
pip install -r requirements.txt
python app/app.py                # Runs nserver DNS on port 153
```

## DNS Architecture

- Custom DNS server using `nserver` on port 153
- Base32-encoded IP addresses in DNS queries (8 chars = IPv4, 32 chars = IPv6)
- IP geolocation via IP2Location database for TXT records
- Supports NS, A, AAAA, TXT, SOA record types

## Environment Variables

### Passim (Go)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8443` | Listen port |
| `API_KEY` | (auto-generated) | Pre-set API key; omit to auto-generate on first run |
| `SSL_MODE` | `letsencrypt` | `self-signed` / `letsencrypt` / `off` |
| `SSL_DOMAIN` | — | Your own domain for Let's Encrypt (highest priority) |
| `SSL_EMAIL` | — | Contact email for Let's Encrypt |
| `DNS_BASE_DOMAIN` | `dns.passim.io` | DNS reflector base domain; auto-discovers public IP when `SSL_DOMAIN` is not set |
| `DATA_DIR` | `/data` | Data directory (SQLite, configs, certs) |
| `GITHUB_REPO` | `anend-s-cat/passim` | GitHub repo for update checks |
| `IMAGE_NAME` | `ghcr.io/anend-s-cat/passim` | Docker image name for self-update |

### DNS
| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_DOMAIN` | — | Base domain for DNS queries |
| `IP` | — | IP address for NS/A records |

## CI/CD & Versioning

Full design: `Doc/spec-cicd.md`

### Version System

Version is injected at build time via `-ldflags`, never hardcoded. Source of truth: `passim/internal/version/version.go`.

```go
var (
    Version   = "dev"       // Set by -ldflags: -X ...version.Version=v1.2.3
    Commit    = "unknown"   // -X ...version.Commit=$(git rev-parse --short HEAD)
    BuildTime = "unknown"   // -X ...version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)
)
```

All code that needs the version MUST use `version.Version` — never hardcode a version string. The Dockerfile accepts `VERSION` and `COMMIT` build args and passes them to ldflags.

Public endpoint `GET /api/version` returns version/commit/build_time (no auth). `GET /api/status` also includes version in the `node.version` field.

### Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/zh-hans/): `<type>(<scope>): <subject>`

| Type | When | Version impact |
|------|------|----------------|
| `feat` | New feature | minor bump |
| `fix` | Bug fix | patch bump |
| `docs` | Documentation only | none |
| `test` | Tests only | none |
| `refactor` | Code change, no behavior change | none |
| `chore` | Build/CI/deps | none |

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on push to `main` and all PRs. Three jobs:

1. **go-test** — `go test -race -cover ./...` + integration tests
2. **web-test** — `pnpm lint` + `pnpm tsc -b` + `pnpm vitest run`
3. **docker-build** — Build Dockerfile (no push), depends on jobs 1+2

### Release Pipeline (`.github/workflows/release.yml`)

Triggers on `v*` tag push. Builds multi-arch Docker images (amd64 + arm64), pushes to GHCR, creates GitHub Release with changelog.

**How to release:**
```bash
git tag -a v1.0.0 -m "release: v1.0.0"
git push origin v1.0.0
# CI builds + pushes ghcr.io/passim/passim:v1.0.0 (+ v1.0, v1, sha tags)
```

### Self-Update Architecture

The running Passim container can update itself. Key packages:

- `internal/update/checker.go` — Queries GitHub Releases API, caches result, runs every 24h in background
- `internal/update/updater.go` — Pulls new image, inspects current container config, launches helper container
- `internal/update/exec.go` — `ExecSwitch()` logic that the helper container runs

**Update flow:** Passim can't stop itself (deadlock), so it launches a **helper container** from the new image:

```
POST /api/update {"version":"v1.1.0"}
  → Pull ghcr.io/passim/passim:v1.1.0
  → Inspect self (hostname = container ID) → extract env/volumes/ports
  → docker create passim-updater (new image, with docker.sock)
       runs: passim update-exec --target=<id> --name=passim --config=<base64>
  → Helper does: stop old → rename old → create new → start new → health check
  → On failure: rollback (rename old back, restart old)
```

The `update-exec` subcommand is handled in `cmd/passim/main.go` before normal startup. It needs Docker socket access and is only called inside the helper container.

### Docker Build

3-stage Dockerfile (`passim/Dockerfile`):

1. **frontend** (node:22-alpine) — `pnpm build` → `web/dist/`
2. **backend** (golang:1.25-alpine) — embeds frontend via `go:embed`, builds with ldflags. Accepts `VERSION` and `COMMIT` build args.
3. **final** (alpine:3.21) — copies binary + templates, adds iperf3, runs as non-root `passim` user

```bash
# Local build
docker compose -f passim/docker-compose.yml build

# Build with version
docker build --build-arg VERSION=v1.0.0 --build-arg COMMIT=$(git rev-parse --short HEAD) \
  -f passim/Dockerfile .
```
