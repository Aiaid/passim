# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AC (Passim) is a personal cloud management assistant for ordinary people — like Portainer, but designed with taste and simplicity for non-technical users. One `docker run` command, open a browser, deploy VPN/storage/remote desktop without touching a terminal.

Full rewrite in progress: legacy multi-component architecture → single Go binary with embedded Web UI. See `Doc/rewrite-plan.md` for details.

## Monorepo Structure

| Directory | Description | Status |
|-----------|-------------|--------|
| `passim/` | Go backend (Gin + SQLite + Docker SDK) | Active — Phase 1 |
| `web/` | Vite + React 19 + shadcn/ui frontend | Complete — Phase 2 |
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
- `PORT` — HTTP listen port (default: `8443`)
- Data stored in `/data/` volume (SQLite, configs, certs)

### DNS
- `BASE_DOMAIN` — Base domain for DNS queries
- `IP` — IP address for NS/A records
