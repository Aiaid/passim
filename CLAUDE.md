# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AC (Passim) is a distributed VPS management and deployment platform. Users provision VPS instances, deploy applications (VPN, remote desktop, storage services), and manage them through a web dashboard backed by a FastAPI control plane.

## Components

1. **Web** — Next.js 15 frontend (App Router, React 19) for managing VPS instances, applications, and deployments
2. **Passim** — Python FastAPI backend that controls Docker containers and VPS provisioning
3. **DNS** — Custom DNS server for dynamic IP-to-domain resolution using Base32 encoding
4. **Updater** — Auto-update service for VPS deployments (Python + Docker)
5. **IoC** — Deployment orchestration (docker-compose)
6. **FIlestash** — File management service container

## Common Commands

### Web (Next.js Frontend)
```bash
cd Web
npm run dev      # Development server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

### Passim (FastAPI Backend)
```bash
cd Passim
pip install -r requirements.txt
uvicorn app.main:app --reload   # Development server
./run.sh                        # Production startup (runs setup then uvicorn)
```

### DNS Server
```bash
cd DNS
pip install -r requirements.txt
python app/app.py               # Runs nserver DNS on port 153
```

### Docker
All components have Dockerfiles. Web uses Node 20 Alpine multi-stage build (standalone output, port 3000). Passim uses Python 3.10 slim.

## Web Architecture (App Router)

The Web frontend has been migrated from Pages Router to App Router (Next.js 15).

### Routing & Layout
- `app/layout.tsx` — Root layout (async server component, sets up metadata)
- `app/providers.tsx` — Client-side providers (`SessionProvider`, `NextIntlClientProvider`, `AntdRegistry`)
- `app/page.tsx` — Home page with auth-based redirect to dashboard
- `app/dashboard/` — Main dashboard (server page + client component)
- `app/app/` — Application management pages (hysteria, l2tp, rdesktop, webdav, wireguard)
- `app/vps/[ip]/` — Dynamic VPS detail pages
- `app/api/` — API routes using `route.ts` convention (`NextRequest`/`NextResponse`)

### Page Pattern: Server/Client Split
Pages follow a consistent pattern — server component (`page.tsx`) handles auth checks and redirects, client component (`client.tsx`) contains the interactive UI with `'use client'` directive. Most existing components in `components/` have been updated with `'use client'`.

### Authentication (NextAuth v5)
- Config in `lib/auth.ts` — exports `handlers`, `auth`, `signIn`, `signOut`
- JWT strategy, MongoDB adapter (`@auth/mongodb-adapter`)
- Providers: Email (Nodemailer), Credentials (Demo)
- Route handler at `app/api/auth/[...nextauth]/route.ts`

### Internationalization (next-intl)
- Uses `next-intl` (not next-i18next) with `createNextIntlPlugin` in `next.config.ts`
- Locales: `en-US`, `zh-CN`
- Message files in `messages/en-US.json`, `messages/zh-CN.json`
- Config in `lib/i18n.ts` using `getRequestConfig`
- `middleware.ts` detects locale from `NEXT_LOCALE` cookie → `Accept-Language` header → defaults to `en-US`
- Client components use `useTranslations()` hook

### Key Dependencies
- `next@^15.0.0`, `react@19.0.0`, `typescript@5.0.0`
- `next-auth@^5.0.0-beta.25` with `@auth/mongodb-adapter@^3.0.0`
- `next-intl@^3.0.0`
- `antd` for UI components
- `mongodb` for database access (`lib/mongodb.ts`)

## Passim Architecture

- `app/main.py` — FastAPI entry with CORS (all origins), rate limiting (`slowapi`), in-memory caching (`fastapi-cache2`)
- `app/vps/docker.py` — Docker container management
- `app/vps/vps.py` — VPS provisioning
- `app/application/application.py` — Application deployment routes
- `app/setup.py` — Initial VPS setup: deploys speedtest, glances, swag (Let's Encrypt) containers, configures SSL
- `app/dependencies.py` — Shared dependencies
- Uses `pyotp` for TOTP, `dnspython` for DNS operations

## DNS Architecture

- Custom DNS server using `nserver` on port 153
- Base32-encoded IP addresses in DNS queries (8 chars = IPv4, 32 chars = IPv6)
- IP geolocation via IP2Location database for TXT records
- Supports NS, A, AAAA, TXT, SOA record types

## Environment Variables

### Web
- `MONGODB_URI` — MongoDB connection string
- NextAuth secrets and provider config (see `.env.development.local`)

### Passim
- `API_SERVER` — API hostname (default: `app.passim.io`)
- `DNS_SERVER` — DNS domain (default: `dns.passim.io`)
- `IP` — Server IP address
- `USER`, `SECRET` — Authentication credentials
- `UPDATER` — Docker image for auto-updater
- `version` — Current version

### DNS
- `BASE_DOMAIN` — Base domain for DNS queries
- `IP` — IP address for NS/A records
