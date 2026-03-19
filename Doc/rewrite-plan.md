# AC (Passim) 系统重写计划书

> 版本: 3.1 | 日期: 2026-03-16

## 产品定位

**Passim 是面向普通人的个人云管理助手。**

大多数人租了 VPS 之后，面对的是黑漆漆的终端和一堆命令行。Portainer 解决了 Docker 管理的问题，但它是给开发者用的——界面复杂、概念多、没有引导。Passim 不一样：一行命令启动，打开浏览器就能部署 VPN、网盘、远程桌面，不需要懂 Docker、不需要写配置文件、不需要碰终端。

Passim 是你的 VPS 管家。它藏起了所有技术细节，只呈现你关心的事情：装一个 VPN、看看服务器状态、下载配置扫码连接。多台 VPS 也不怕，任何一台都能管其他的，没有中心、没有额外部署。

**核心受众**: 有 VPS 但不想（或不会）折腾命令行的普通用户——可能是为了翻墙、远程办公、私有网盘，也可能只是想有一个属于自己的云。

**设计原则**:
- **即装即用** — `docker run` 一行命令，不需要第二步
- **隐藏复杂度** — 用户看到的是"部署 VPN"，不是"创建容器"
- **有品位** — 界面干净克制，不堆功能、不用默认蓝
- **自给自足** — 一个容器 = 全部功能，不依赖外部服务

### 相关文档

| 文档 | 说明 |
|------|------|
| [stories/](./stories/) | User Stories 与验收标准 (按 Epic 分文件) |
| [spec-passim.md](./spec-passim.md) | Passim 服务详细设计 (API/配置/多节点/CLI) |
| [spec-web.md](./spec-web.md) | Web 前端详细设计 (页面/组件/状态管理) |
| [spec-app.md](./spec-app.md) | 手机 App 详细设计 (Expo/导航/推送/构建) |
| [spec-dns.md](./spec-dns.md) | DNS 服务详细设计 (Base32 编码/记录类型/部署) |
| [spec-templates.md](./spec-templates.md) | 应用模板引擎设计 (配置映射/用户管理/用量追踪) |
| [spec-cicd.md](./spec-cicd.md) | CI/CD 与版本管理设计 (流水线/发布/自我更新) |
| [stories/epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md) | 云服务商直连 (App 端直连 Vultr/DO/Hetzner/Lightsail) |

---

## 一、现有系统概述

AC (Passim) 目前是一个分布式 VPS 管理与应用部署平台，用户通过 Web 控制台管理 VPS 实例、部署 VPN/存储/远程桌面等服务，后端通过 Docker 编排完成自动化运维。但现有系统更像是给开发者写的工具——组件分散、概念外露、缺少面向普通用户的引导和体验打磨。

### 当前组件

| 组件 | 技术栈 | 职责 |
|------|--------|------|
| Web | Next.js 15 / React 19 / Ant Design / MongoDB | 前端控制台 |
| Passim | Python FastAPI / Docker SDK | VPS 控制面 (每台 VPS 部署一个) |
| DNS | Python nserver / IP2Location | Base32 动态域名解析 |
| Updater | Python / Docker | VPS 端自动更新 |

### 当前功能清单

**VPS 管理**: 添加/删除/重命名/重新配置 VPS，实时监控 (CPU/内存/磁盘/网络/负载)，Docker 容器管理 (启停/删除/日志/部署)

**应用服务**: L2TP/IPSec VPN, Wireguard VPN, V2ray 代理, Hysteria 代理, WebDAV 存储, Samba 文件共享, RDesktop 远程桌面, S3 兼容存储

**基础设施**: Let's Encrypt 自动 SSL (SWAG 容器), Speedtest 测速 (独立容器), Glances 监控, DNS 健康检查, TOTP 认证, 多语言 (en-US/zh-CN)

---

## 二、重写动机与现有痛点

### 架构层面

1. **4 个独立组件** — Web / Passim / DNS / Updater 各自独立部署，运维复杂
2. **无统一管理入口** — 前端直连每台 VPS 的 Passim，暴露所有 VPS IP
3. **无任务队列** — 部署操作同步阻塞，前端轮询状态，无重试/回滚
4. **认证体系割裂** — Web 用 NextAuth JWT，Passim 用 TOTP Header

### 代码层面

5. **前后端职责模糊** — Web API routes 直接操作 MongoDB、调用 Passim
6. **组件重复度高** — `card/`、`new_card/`、`info/`、`howto/` 中各应用组件近乎一致
7. **无测试覆盖** — 前后端均无测试
8. **配置硬编码** — Docker 镜像名、端口映射散落在代码各处

### 运维层面

9. **更新机制粗糙** — Updater 直接 stop/rm/pull/run，无健康检查
10. **SSL 管理耦合** — SWAG 容器与 Passim 紧密耦合，Speedtest 也需独立容器

---

## 三、重写目标

重写的核心不是技术升级，而是**把一个开发者工具变成普通人的产品**。

| 优先级 | 目标 | 说明 |
|--------|------|------|
| P0 | 单一服务 | 一个 Docker 容器 = 全部功能 (API + Web UI + 本地管理 + 远程节点管理) |
| P0 | 即装即用 | `docker run` 一行命令启动，不需要配置文件、不需要数据库、不需要第二步 |
| P0 | 对等多节点 | 任意 Passim 实例可连接其他实例，没有中心、没有额外部署 |
| P0 | 可靠部署 | 异步任务 + 重试 + 进度推送，用户不需要盯着终端 |
| P1 | 插件化应用 | YAML 模板定义应用，用户看到的是"一键部署 VPN"，开发者看到的是可扩展的模板 |
| P1 | 有品位的界面 | Vite + React 19 + shadcn/ui + Tailwind CSS v4，干净克制，不堆功能 |
| P1 | 可观测性 | 内置指标采集 (替代 Glances)，用户只看到简洁的仪表盘 |
| P2 | 多用户 | 用户隔离、配额、RBAC |

---

## 四、新架构设计

### 核心理念：一个 Passim，对等互联

不再区分 "Node Service" 和 "Gateway"。每台 VPS 运行**同一个 Passim Docker 容器**，它既管理本机，也可以连接管理其他 VPS。

对用户来说，这意味着：买一台 VPS，装一行命令，打开浏览器就能用。买了第二台？在第一台的界面里加一下就行，不需要装新东西。

```
VPS A                    VPS B                    VPS C
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Passim     │◄═══════►│   Passim     │         │   Passim     │
│              │WebSocket│              │         │              │
│ • Web UI     │         │ • Web UI     │         │ • Web UI     │
│ • REST API   │         │ • REST API   │         │ • REST API   │
│ • Docker Mgr │         │ • Docker Mgr │         │ • Docker Mgr │
│ • SQLite     │         │ • SQLite     │         │ • SQLite     │
│              │         │              │         │              │
│ 管理: A      │         │ 管理: B      │         │ 管理: C      │
│ 远程: B      │         │ 远程: (无)   │         │ 远程: (无)   │
└──────────────┘         └──────────────┘         └──────────────┘
    ↕ docker.sock            ↕ docker.sock            ↕ docker.sock
[容器][容器][容器]       [容器][容器]              [容器][容器][容器]
```

**场景 1**: 单机用户

```bash
docker run -d -v /var/run/docker.sock:/var/run/docker.sock \
  -v passim-data:/data -p 8443:8443 -p 80:80 passim/passim
# 访问 https://<ip>:8443 → 管理本机 (端口 80 用于 ACME 证书验证)
```

**场景 2**: 多机管理

```
用户在 VPS A 的 Web UI:
  [+ Add Remote Node]
  → 地址: vps-b:8443
  → API Key: (VPS B 的 key)
  → [Connect]

VPS A 的 Passim 通过 WebSocket 连接 VPS B 的 Passim
→ A 的面板同时显示 A 和 B 的状态/容器/应用
→ 可以从 A 向 B 下发部署指令
```

**场景 3**: 多点互联

```
VPS A 连接了 B 和 C
VPS B 也连接了 C
→ 各自看到自己连接的节点
→ 没有中心，任一节点可作为管理入口
```

### 与旧架构的对比

| 旧 (4 组件) | 新 (1 组件) |
|-------------|-------------|
| Web (Next.js) 独立部署 | 前端嵌入 Passim Docker 镜像 |
| Passim (Python) 仅被动 API | Passim (Go) 管本机 + 管远程 |
| Gateway (无) | 内置远程节点管理 |
| Updater (Python) 独立容器 | 内置自我更新 |
| MongoDB (集中) | SQLite (本地，每台独立) |
| Glances 容器 (监控) | 内置 gopsutil 指标采集 |
| SWAG 容器 (SSL) | 内置 autocert ACME 客户端 |
| Speedtest 容器 (测速) | 内置 HTTP 测速端点 + iperf3 |
| 4+ 个进程 + 数据库 | 1 个 Docker 容器 |
| 无手机 App | Expo 手机 App (iOS + Android) |

### Docker 容器结构

```dockerfile
FROM golang:1.25-alpine AS builder
# 编译 Go 后端 (内嵌静态前端文件)
COPY . .
RUN go build -o /passim ./cmd/passim/

FROM alpine:3.21
RUN apk add --no-cache ca-certificates iperf3
COPY --from=builder /passim /usr/local/bin/passim
COPY templates/ /etc/passim/templates/

VOLUME /data           # SQLite + 配置 + 应用数据 + 证书
EXPOSE 8443 80 5201

ENTRYPOINT ["passim"]
```

```bash
docker run -d \
  --name passim \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v passim-data:/data \
  -p 8443:8443 \
  -p 80:80 \
  -p 5201:5201 \
  passim/passim:latest
# 8443: 主 HTTPS/HTTP 端口
# 80:   ACME HTTP-01 证书验证 + HTTP→HTTPS 重定向
# 5201: iperf3 测速
```

**环境变量:**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8443` | 监听端口 |
| `API_KEY` | (自动生成) | 预设 API Key；省略则首次启动自动生成 |
| `SSL_MODE` | `self-signed` | `self-signed` / `letsencrypt` / `off` |
| `SSL_DOMAIN` | — | Let's Encrypt 域名（最高优先级） |
| `SSL_EMAIL` | — | Let's Encrypt 联系邮箱 |
| `DNS_BASE_DOMAIN` | — | DNS 反射器基础域名；未设 `SSL_DOMAIN` 时自动发现公网 IP 拼域名 |
| `DATA_DIR` | `/data` | 数据目录 |
| `GITHUB_REPO` | `passim/passim` | GitHub 仓库 (更新检查用) |
| `IMAGE_NAME` | `ghcr.io/passim/passim` | Docker 镜像名 (自我更新用) |

**Volume 挂载:**

| 路径 | 说明 |
|------|------|
| `/var/run/docker.sock` | Docker Engine 通信 (必须) |
| `/data/passim.db` | SQLite 数据库 |
| `/data/configs/` | 应用配置文件 (Wireguard conf 等) |
| `/data/ssl/` | SSL 证书 (autocert 自动管理) |

---

## 五、技术栈

### 后端 (Go)

| 类别 | 选择 | 理由 |
|------|------|------|
| 语言 | **Go 1.25** | 单二进制、高并发、Docker SDK 原生支持 |
| HTTP | **Gin** | 轻量框架 |
| 数据库 | **SQLite** (go-sqlite3, WAL) | 零配置嵌入式，每台 VPS 独立 |
| 容器 | **Docker SDK (Go)** | 直接调用 Docker Engine API |
| 指标 | **gopsutil** | 系统指标采集，替代 Glances 容器 |
| SSL | **autocert** (x/crypto) | 内置 ACME 客户端，自动 Let's Encrypt，替代 SWAG 容器 |
| 测速 | **内置 HTTP 端点** + **iperf3** | 浏览器测速 + 节点间吞吐量测试，替代 Speedtest 容器 |
| 多节点通信 | **WebSocket** (gorilla/websocket) | Passim 实例间双向通信 |
| 任务 | **内存队列** + SQLite 持久化 | 单机场景不需要 Redis |
| 前端嵌入 | **Go embed** | 静态文件打包进二进制 |
| 认证 | **JWT** + **API Key** + **WebAuthn** | API Key 登录 + Passkey 便捷登录，签发 JWT |
| 配置 | **Viper** | YAML 配置文件 |

### 前端 (Vite + React)

| 类别 | 选择 | 理由 |
|------|------|------|
| 构建 | **Vite 8** | 快，轻量，不需要 SSR |
| 框架 | **React 19** | |
| UI | **shadcn/ui** + **Tailwind CSS v4** | 零运行时、OKLCH、可定制 |
| 路由 | **React Router 7** | SPA 路由 |
| 状态 | **Zustand** | 全局 UI 状态 |
| 服务端状态 | **TanStack Query** | 缓存/去重/自动刷新 |
| 表单 | **React Hook Form + Zod** | 类型安全验证 |
| 图表 | **Recharts** | 监控仪表盘 |
| i18n | **react-i18next** | 多语言 (en-US / zh-CN) |
| 图标 | **Lucide React** | |

#### 为什么从 Next.js 换成 Vite

| | Next.js | Vite + React |
|--|---------|-------------|
| SSR/RSC | 有，但嵌入 Go 后用不上 | 不需要 |
| 构建产物 | 需要 Node.js runtime | 纯静态文件，Go embed 直接嵌入 |
| 包大小 | ~2MB+ (standalone) | ~200KB (gzip) |
| 路由 | 文件系统路由 | React Router (显式) |
| API 层 | API Routes (用不上) | 直接调 Go API |
| 复杂度 | middleware/server actions 等概念 | 简单直接 |

管理后台不需要 SEO，不需要 SSR。Vite 产出纯静态文件，完美嵌入 Go 二进制。

### 手机 App (Expo)

| 类别 | 选择 | 理由 |
|------|------|------|
| 框架 | **Expo SDK 52+** | 统一 iOS/Android，OTA 更新 |
| 导航 | **Expo Router** | 文件系统路由，与 Expo 深度集成 |
| UI | **React Native** + 自定义组件 | 与 Web 保持视觉一致性 |
| 状态 | **Zustand** + **TanStack Query** | 与 Web 端方案一致，复用逻辑 |
| 认证 | **WebAuthn (Passkey)** | 指纹/面容登录，与 Passim Passkey 后端共用 |
| 通知 | **Expo Notifications** | 推送节点离线/部署完成等事件 |
| 二维码 | **expo-camera** | 扫码添加节点、扫码导入配置 |
| 存储 | **expo-secure-store** | 安全存储 JWT / API Key |

#### 为什么用手机 App 而不只是响应式 Web

Passim 的核心用户是普通人，大部分场景发生在手机上：扫码连 VPN、出门前看一眼服务状态、收到节点离线通知。Web 响应式做不到的事：

- **VPN 配置直接导入** — deep link / URL scheme 打开 WireGuard/Stash 等 App
- **推送通知** — 节点离线、容器停止、SSL 过期，不用一直开着页面
- **生物认证** — Face ID / 指纹解锁，比在手机浏览器输密码自然得多
- **扫码连接** — 手机扫 Web UI 的二维码一步添加节点

### DNS

保持现有 Python nserver 实现，独立运行。后续可选 Go 重写。

---

## 六、模块设计

### 项目结构

```
passim/
├── cmd/passim/
│   └── main.go                      # 入口
├── internal/
│   ├── api/                         # HTTP REST API (Gin)
│   │   ├── router.go
│   │   ├── middleware.go            # JWT 验证 / 日志 / CORS
│   │   ├── auth.go                  # POST /auth/login
│   │   ├── status.go               # GET /status
│   │   ├── container.go            # /containers/*
│   │   ├── app.go                  # /apps/*
│   │   ├── template.go             # /templates
│   │   ├── config.go               # /apps/:id/configs/*
│   │   ├── node.go                 # /nodes/* (远程节点管理)
│   │   ├── metrics.go              # /metrics/stream (SSE)
│   │   └── static.go               # 前端静态文件服务
│   ├── docker/                      # Docker Engine 交互
│   │   ├── client.go
│   │   ├── container.go            # 容器 CRUD
│   │   ├── image.go
│   │   └── deploy.go               # 模板 → 容器部署
│   ├── template/                    # 应用模板引擎
│   │   ├── parser.go               # YAML 解析
│   │   ├── registry.go             # 模板注册表
│   │   └── render.go               # 参数渲染 {{settings.xxx}}
│   ├── metrics/                     # 系统指标 (gopsutil)
│   │   ├── collector.go
│   │   └── types.go
│   ├── db/                          # SQLite
│   │   ├── sqlite.go               # 连接 (WAL 模式)
│   │   ├── migrations.go           # 内嵌迁移
│   │   └── queries.go              # CRUD
│   ├── node/                        # 远程节点管理
│   │   ├── hub.go                   # WebSocket 连接管理器
│   │   ├── client.go               # 连接到远程 Passim
│   │   ├── server.go               # 接受远程连接
│   │   ├── proxy.go                # 转发请求到远程节点
│   │   └── sync.go                 # 状态同步
│   ├── task/                        # 异步任务
│   │   ├── queue.go                 # 内存队列 + SQLite 持久化
│   │   ├── worker.go               # 任务消费
│   │   └── types.go                # 任务类型定义
│   ├── ssl/                         # SSL/TLS 证书管理
│   │   ├── manager.go               # autocert ACME + 自签回退
│   │   └── selfsigned.go            # 自签证书生成
│   ├── speedtest/                   # 内置测速
│   │   ├── http.go                  # 浏览器测速端点 (download/upload/ping)
│   │   └── iperf.go                 # iperf3 server 管理 (节点间测速)
│   ├── setup/                       # 初始化
│   │   └── setup.go                 # 首次启动流程
│   ├── auth/                        # 认证
│   │   ├── apikey.go                # API Key 管理
│   │   ├── jwt.go                   # JWT 签发/验证
│   │   └── webauthn.go              # Passkey (WebAuthn/FIDO2)
│   ├── version/                     # 版本信息 (ldflags 注入)
│   │   └── version.go
│   └── update/                      # 自我更新
│       ├── checker.go               # GitHub Releases 版本检查
│       ├── updater.go               # 镜像拉取 + helper 容器编排
│       └── exec.go                  # update-exec 切换逻辑
├── web/                             # 前端源码 (Vite + React)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/                  # 页面
│   │   ├── components/              # 组件
│   │   ├── lib/                     # 工具
│   │   ├── hooks/                   # 自定义 hooks
│   │   ├── stores/                  # Zustand
│   │   └── types/                   # TypeScript 类型
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── web/dist/                        # 前端构建产物 (go:embed)
├── templates/                       # 应用模板 YAML
│   ├── wireguard.yaml
│   ├── l2tp.yaml
│   ├── v2ray.yaml
│   ├── hysteria.yaml
│   ├── webdav.yaml
│   ├── samba.yaml
│   └── rdesktop.yaml
├── Dockerfile
├── docker-compose.yaml
├── go.mod
└── go.sum

.github/workflows/
├── ci.yml                           # CI: Go test + 前端 lint/test + Docker build
└── release.yml                      # CD: v* tag → 多架构镜像 + GitHub Release
```

### 应用模板 (不变)

```yaml
# templates/wireguard.yaml
name: wireguard
category: vpn
version: 1.0.0
icon: shield
description:
  en-US: "Peer-to-peer VPN using WireGuard protocol"
  zh-CN: "基于 WireGuard 协议的点对点 VPN"
settings:
  - key: peers
    type: number
    min: 1
    max: 25
    default: 1
    label: { en-US: "Number of Peers", zh-CN: "对等节点数" }
container:
  image: linuxserver/wireguard
  ports: ["51820:51820/udp"]
  volumes: ["/data/configs/wireguard:/config"]
  environment:
    PEERS: "{{settings.peers}}"
  labels:
    io.passim: vpn
    io.passim.app: wireguard
config_export:
  format: conf
  path: /data/configs/wireguard/wg_confs/
  pattern: "peer*.conf"
```

### 数据库 (SQLite)

```sql
-- 节点配置
CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
-- node_id, node_name, api_key_hash, auth_version, setup_complete

-- Passkey (WebAuthn) 凭证
CREATE TABLE passkeys (
    id              TEXT PRIMARY KEY,
    credential_id   BLOB NOT NULL UNIQUE, -- WebAuthn credential ID
    public_key      BLOB NOT NULL,        -- COSE public key
    name            TEXT,                  -- "MacBook Touch ID", "YubiKey" 等
    sign_count      INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    last_used_at    TEXT
);

-- 远程节点
CREATE TABLE remote_nodes (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    address    TEXT NOT NULL,       -- host:port
    api_key    TEXT NOT NULL,
    status     TEXT DEFAULT 'disconnected',
    country    TEXT,
    last_seen  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 本地应用实例
CREATE TABLE apps (
    id           TEXT PRIMARY KEY,
    template     TEXT NOT NULL,
    settings     TEXT NOT NULL,      -- JSON
    status       TEXT DEFAULT 'stopped',
    container_id TEXT,
    deployed_at  TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
);

-- 远程部署记录 (从本节点部署到远程的)
CREATE TABLE remote_deployments (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL,     -- remote_nodes.id
    template     TEXT NOT NULL,
    settings     TEXT NOT NULL,
    status       TEXT DEFAULT 'queued',
    error        TEXT,
    deployed_at  TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
);

-- 任务队列
CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    target      TEXT,               -- 'local' 或 remote node_id
    payload     TEXT NOT NULL,      -- JSON
    status      TEXT DEFAULT 'queued',
    result      TEXT,
    retries     INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    created_at  TEXT DEFAULT (datetime('now')),
    finished_at TEXT
);

-- S3 凭证
CREATE TABLE s3_credentials (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    endpoint   TEXT,
    bucket     TEXT,
    access_key TEXT,
    secret_key TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 分享 token
CREATE TABLE share_tokens (
    id         TEXT PRIMARY KEY,
    app_id     TEXT NOT NULL,
    user_index INTEGER DEFAULT 0,
    token      TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    revoked    INTEGER DEFAULT 0
);
```

> **注**: `apps` 表还有 `generated TEXT DEFAULT '{}'` 列（idempotent ALTER），存储部署时的自动生成值供客户端配置渲染使用。

### 多节点通信

```
VPS A (管理者)                    VPS B (被管理)
┌──────────────┐                 ┌──────────────┐
│  Node Hub    │                 │  Node Server │
│              │                 │              │
│  client.go ──┼── WebSocket ───►  server.go   │
│              │                 │              │
│  发送:       │                 │  接收:       │
│  - 任务下发  │                 │  - 执行任务  │
│  - 状态查询  │                 │  - 返回结果  │
│              │                 │              │
│  接收:       │                 │  发送:       │
│  - 心跳+指标 │                 │  - 心跳+指标 │
│  - 任务结果  │                 │  - 状态变更  │
└──────────────┘                 └──────────────┘
```

**连接流程:**
1. A 向 B 发起 WebSocket: `wss://vps-b:8443/ws/node?key=<B's API Key>`
2. B 验证 API Key → 接受连接
3. B 开始每 10s 推送心跳 + 指标 + 容器状态
4. A 可通过此连接向 B 下发任务 (部署/停止/删除等)
5. 断线自动重连 (指数退避，上限 60s)

**安全:**
- 必须使用 B 的 API Key 才能连接
- B 可以随时在自己的面板上看到谁连接了它
- B 可以拒绝或断开连接

---

## 七、API 设计

所有 API 前缀 `/api`，前端静态文件在根路径 `/` 提供。

### 认证

用户登录支持两种方式: API Key (主要/首次) + Passkey (便捷/日常)。
节点间 WebSocket 通信使用 API Key 直接认证。

```
# API Key 登录
POST /api/auth/login                    { "api_key": "xxx" } → { "token": "jwt..." }
POST /api/auth/refresh                  { "token": "xxx" }   → { "token": "new-jwt..." }

# Passkey (WebAuthn) 登录
POST /api/auth/passkey/begin            → { challenge options }
POST /api/auth/passkey/finish           { credential }       → { "token": "jwt..." }

# Passkey 管理 (需已登录)
GET    /api/auth/passkeys               → [{ id, name, created_at, last_used_at }]
POST   /api/auth/passkey/register       → { challenge options }
POST   /api/auth/passkey/register/finish → { ok }
DELETE /api/auth/passkeys/:id

# API Key 管理 (需已登录)
GET    /api/settings/api-key            → { prefix, created_at }
POST   /api/settings/api-key/regenerate → { api_key }  ← 仅此一次明文返回
```

### 本地状态

```
GET  /api/status                    # 系统状态 (CPU/MEM/DISK/NET/容器概览)
GET  /api/metrics/stream            # SSE 实时指标 (每 5s)
```

### 本地容器

```
GET    /api/containers              # 容器列表
POST   /api/containers/:name/start
POST   /api/containers/:name/stop
POST   /api/containers/:name/restart
DELETE /api/containers/:name
GET    /api/containers/:name/logs?lines=200&follow=false
```

### 本地应用

```
GET    /api/templates               # 可用模板列表
GET    /api/apps                    # 已部署应用列表
POST   /api/apps                    # 部署新应用 { template, settings }
GET    /api/apps/:id
DELETE /api/apps/:id                # 卸载
PATCH  /api/apps/:id               # 更新配置
GET    /api/apps/:id/configs        # 原始配置文件列表
GET    /api/apps/:id/configs/:file  # 下载原始配置文件
GET    /api/apps/:id/client-config  # 模板驱动的客户端配置 (三种类型)
GET    /api/apps/:id/client-config/file/:n  # 下载 peer 配置文件
GET    /api/apps/:id/client-config/zip      # ZIP 打包下载
GET    /api/apps/:id/subscribe      # Clash/Stash 订阅 YAML
POST   /api/apps/:id/share          # 创建分享 token
DELETE /api/apps/:id/share          # 撤销分享
GET    /api/apps/:id/events         # SSE 部署进度
```

### 公开分享端点 (无需认证)

```
GET    /api/s/:token                # 分享配置数据
GET    /api/s/:token/subscribe      # 分享订阅 YAML
GET    /api/s/:token/file/:n        # 分享文件下载
```

### 远程节点管理

```
GET    /api/nodes                   # 已连接的远程节点列表
POST   /api/nodes                   # 添加远程节点 { address, api_key }
DELETE /api/nodes/:id               # 断开远程节点
PATCH  /api/nodes/:id               # 重命名

# 以下请求通过 WebSocket 代理到远程节点
GET    /api/nodes/:id/status
GET    /api/nodes/:id/metrics/stream
GET    /api/nodes/:id/containers
POST   /api/nodes/:id/containers/:name/start
POST   /api/nodes/:id/containers/:name/stop
DELETE /api/nodes/:id/containers/:name
GET    /api/nodes/:id/containers/:name/logs
GET    /api/nodes/:id/apps
POST   /api/nodes/:id/apps          # 远程部署
DELETE /api/nodes/:id/apps/:id
GET    /api/nodes/:id/apps/:id/configs
GET    /api/nodes/:id/apps/:id/configs/:file
```

### 存储

```
GET    /api/s3
POST   /api/s3
PUT    /api/s3/:id
DELETE /api/s3/:id
POST   /api/s3/:id/test             # 测试连接
```

### 任务

```
GET    /api/tasks
GET    /api/tasks/:id
GET    /api/tasks/:id/events        # SSE 进度
```

### WebSocket (节点间)

```
GET    /ws/node?key=<api_key>       # 远程 Passim 连接端点
```

---

## 八、实施阶段

### Phase 1: Passim Core ✅ (已完成 2026-03-13)

**目标**: Go 重写 Passim，单机可用

- [x] Go 项目初始化 (Gin + SQLite + Docker SDK)
- [x] 系统指标采集 (gopsutil，替代 Glances)
- [x] Docker 容器管理 API (list/start/stop/rm/logs)
- [x] 应用模板引擎 (YAML 解析 + 参数渲染 + Docker 部署)
- [x] 迁移所有现有应用为 YAML 模板 (7 个: wireguard, l2tp, hysteria, v2ray, webdav, samba, rdesktop)
- [ ] 配置导出格式转换 (mobileconfig) — 基础文件下载已实现，iOS mobileconfig 移至 Phase 5
- [x] API Key 认证 + JWT (Passkey/WebAuthn 移至 Phase 2)
- [x] SQLite 数据持久化
- [x] 异步任务队列 (内存 channel + SQLite 持久化 + 自动重试)
- [x] SSL 证书管理 (自签 + autocert ACME Let's Encrypt + 自定义证书上传)
- [x] 内置测速 (HTTP download/upload/ping 端点 + iperf3 server)
- [x] SSE 实时推送 (指标流 + 任务进度 + 应用事件)
- [x] Dockerfile (3 阶段: Node→Go→Alpine, 嵌入前端)
- [x] 单元测试 (192 test functions, 277 test runs 含子测试, 12 个包全部通过)

**交付物**: `docker run` 一行启动，可管理本机容器和应用 (无 Web UI，API-only)

**Phase 1 实际实现的 API 端点:**
```
# 公开 (无需认证)
GET  /api/version                 # 版本信息 (version/commit/build_time)
POST /api/auth/login              # API Key → JWT
POST /api/auth/refresh            # 刷新 JWT
GET  /api/speedtest/download      # 下载测速
POST /api/speedtest/upload        # 上传测速
GET  /api/speedtest/ping          # 延迟测试

# 需认证 (Bearer JWT)
GET  /api/status                  # 系统状态
GET  /api/metrics/stream          # SSE 指标流 (每 5s)
GET  /api/containers              # 容器列表
POST /api/containers/:id/start|stop|restart
DELETE /api/containers/:id
GET  /api/containers/:id/logs
GET  /api/templates               # 模板列表
POST /api/apps                    # 部署应用 (同步或异步)
GET  /api/apps                    # 应用列表
GET  /api/apps/:id
PATCH /api/apps/:id               # 更新设置
DELETE /api/apps/:id              # 卸载
GET  /api/apps/:id/configs        # 原始配置文件列表
GET  /api/apps/:id/configs/:file  # 下载原始配置
GET  /api/apps/:id/client-config  # 客户端配置 (模板驱动)
GET  /api/apps/:id/subscribe      # Clash 订阅
POST /api/apps/:id/share          # 创建分享
GET  /api/apps/:id/events         # SSE 应用事件
GET  /api/tasks                   # 任务列表
GET  /api/tasks/:id
GET  /api/tasks/:id/events        # SSE 任务进度
GET  /api/ssl/status
POST /api/ssl/renew
GET  /api/speedtest/iperf/status
GET  /api/version/check           # 检查更新 (Phase 4)
POST /api/update                  # 触发更新 (Phase 4)
```

### Phase 2: Web UI ✅ (已完成 2026-03-14)

**目标**: Vite + React + shadcn/ui 前端

- [x] 项目初始化 (Vite 8.0.0 + React 19.2.4 + TypeScript 5.9.3 + Tailwind 4.2.1 + shadcn/ui)
- [x] 设计系统 (OKLCH 色彩 / 暗色模式)
- [x] 登录页 (API Key + Passkey)
- [x] Dashboard 总览 (系统指标 + 容器摘要 + 应用概览)
- [x] 容器管理 (列表 + 操作 + 日志 Sheet)
- [x] 应用管理 — 模板浏览 / 部署向导 (动态表单) / 应用详情 + 配置导出
- [ ] S3 凭证管理 ← 移至 Phase 3
- [x] 设置页 (通用 + 安全 Passkey/API Key + SSL)
- [x] SSE 实时数据集成 (指标流 + 应用事件 + 任务进度)
- [x] 国际化 (en-US / zh-CN)
- [x] 响应式布局 (use-mobile hook)
- [x] Passkey (WebAuthn) 后端 API + 前端注册/登录
- [x] 单元测试 (Go 203 + Frontend 130 = 333 tests)
- [x] Go embed 嵌入 + Dockerfile (3 阶段: Node→Go→Alpine)
- [x] 集成测试 + E2E 测试 (12 Go integration + 8 Go E2E + 16 Playwright E2E)

**交付物**: 功能完整的单机 Passim (API + Web UI)

**注**: Phase 2 结束后进入密集打磨期 (Phase 2.5)，见下文。

### Phase 2.5: UI/UX 打磨 + 部署修复 ✅ (已完成 2026-03-16)

**目标**: 生产级 UI 质量和部署稳定性

Phase 2 完成后的密集打磨期（~30 commits），包含重大 UI 重设计和关键 bug 修复。

- [x] Dashboard 视觉重设计: 3D 地球仪 (Three.js) + 服务器位置标记 + 信息面板
- [x] "Orbital Glass" 设计语言 — 全站统一的太空/玻璃质感美学
- [x] 亮色/暗色模式地球仪各自独立视觉方案
- [x] 统一 SSE 流: 单一 `/api/stream` 替代多个 SSE 连接 + HTTP 轮询
- [x] 应用管理页重设计: Orbital Glass 风格卡片 + 详情面板
- [x] 侧边栏: Passim logo、尺寸优化、Sheet UX、Safari backdrop-filter 修复、退出登录按钮
- [x] 部署管线完善: 端口映射、容器参数 (args/sysctls)、卷挂载
- [x] 防重复部署 + 重试状态修复
- [x] Docker 容器清理: 启动失败时移除残留容器、卸载时按名称移除
- [x] 应用设置更新触发重新部署 + 生成值解析
- [x] VPN 配置文件路径修复 + 下载修复
- [x] Hysteria TLS 配置修复 + 表单验证
- [x] WebAuthn 凭证标志存储修复 (backup eligible mismatch)
- [x] Passkey 认证、Select 设置、容器面板、SSL 设置修复
- [x] i18n 缺失翻译键补全 (dashboard/metrics/settings)
- [x] 移动端侧边栏交互修复
- [x] `GET /api/status` 增加经纬度 (latitude/longitude) 字段
- [x] `GET /api/templates/:name` 单模板查询端点

**测试**: Go 237 + Frontend 130 = 367 tests (全部通过)

**交付物**: 生产级 UI 质量的单机 Passim，部署流程稳定可靠

### Phase 3: 多节点管理 ✅ (已完成 2026-03-19)

**目标**: 对等互联，管理远程节点

**注**: 实际实现采用 **SSE + REST 代理** 替代了原计划的 WebSocket 协议。Hub 订阅远程节点的 `/api/stream` SSE 获取实时数据，操作通过 `ProxyRequest` 转发 REST API。比 WebSocket 更简单，每个节点本身就有完整 REST API，无需额外协议。

**后端 (Go):**
- [x] `internal/node/` 包: hub.go (Hub 连接管理/CRUD/ProxyRequest) + client.go (SSE 订阅/自动重连/认证)
- [x] SSE 实时数据订阅 (替代 WebSocket)
  - 自动 HTTPS/HTTP 探测 + JWT 认证 + 401 自动刷新 token
  - 指数退避重连 (1s→60s 上限)
  - 实时推送: metrics / status / containers / apps 事件
- [x] Node Hub (管理端): 连接管理、状态聚合、请求代理、节点测速
- [x] 远程节点 CRUD API (`POST/GET/DELETE/PATCH /api/nodes`)
- [x] 远程代理 API (`GET /api/nodes/:id/status|containers|apps|...`)
- [x] 远程部署 API (`POST /api/nodes/:id/apps`)
- [x] 批量部署 API (`POST /api/batch/deploy`)
- [x] 节点间测速 API (`POST /api/nodes/:id/speedtest`)
- [ ] 连接管理 API (`GET /api/connections`, `DELETE /api/connections/:id`) — stub，返回空列表/501
- [x] S3 凭证管理 DB 层 (`db/node.go` CRUD) — API 端点待接入

**前端 (Web):**
- [x] 新路由: `/nodes` (节点列表), `/nodes/:id` (节点详情)
- [x] 添加/移除远程节点 UI (`AddNodeDialog` + `ConfirmDialog`)
- [x] `NodeCard` 组件 (国旗、CPU/MEM 小条、连接状态动画)
- [x] 节点详情页三个 Tab (Overview / Containers / Apps)
- [x] 统一面板显示本地 + 远程节点 (`MultiNodePanel` + Dashboard 地球仪标记)
- [x] 远程容器列表 + Sheet 详情
- [x] 远程应用列表 + `AppDetailPanel`
- [x] "Deploy to" 目标选择器 (部署向导中 `selectedTargets`)
- [x] 批量部署到多节点 (`batchDeployMutation`)
- [ ] 连接授权管理 (查看/断开连接) — 后端 stub 未实现

**测试:**
- [x] Node Hub 单元测试 (`hub_test.go`)
- [x] Node Client 单元测试 (`client_test.go`)
- [x] Node API 测试 (`node_test.go`)

**数据库**: `remote_nodes` 和 `remote_deployments` 表已在 Phase 1 建好，`s3_credentials` 表已建好

**交付物**: 完整的多节点 Passim (SSE + REST 代理架构)

### Phase 4: 打磨 + 迁移 (2 周)

**目标**: 生产就绪

- [ ] MongoDB → SQLite 数据迁移脚本
- [ ] 旧 Passim → 新 Passim 替换脚本
- [x] 版本基础设施 (`internal/version` + ldflags 注入 + `GET /api/version` + `--version` flag)
- [x] CI 流水线 (`.github/workflows/ci.yml` — Go test + 前端 lint/test + Docker build)
- [x] Release 流水线 (`.github/workflows/release.yml` — 多架构 Docker 镜像 + GitHub Release)
- [x] 自我更新机制 (`internal/update` — 版本检查 + 镜像拉取 + helper 容器切换 + 回滚)
- [x] 模板驱动客户端配置导出 (`clients` 三种类型: file_per_user/credentials/url + 解析引擎 + API + 前端)
- [x] 分享机制 (share token 创建/撤销 + 公开访问端点 `/api/s/:token`)
- [x] Clash/Stash 订阅生成 (`/api/apps/:id/subscribe` + URI 解析 + 跨节点聚合)
- [x] 配置 ZIP 打包下载 (支持多节点国旗前缀)
- [x] 模板 YAML 迁移 (7 个模板: clients + share + guide.platforms)
- [ ] 容器日志 (Sheet + 实时尾随 + 搜索)
- [ ] 监控历史图表 (最近 1h/6h/24h)
- [ ] 性能优化 + 安全审查
- [ ] 文档

**交付物**: 可从旧系统迁移的生产版本

### Phase 5: 手机 App + 增强功能 (4 周 + 持续)

**目标**: 手机 App 让 Passim 从"打开电脑才能管"变成"随手就能管"

**手机 App (Expo):**
- [ ] Expo 项目初始化 (Expo Router + Zustand + TanStack Query)
- [ ] 连接节点 (手动输入 + 扫码添加)
- [ ] Dashboard 概览 (节点状态 + 应用列表)
- [ ] 应用管理 (启停/部署/详情)
- [ ] VPN 配置导出 (deep link 导入 WireGuard/Stash + 二维码全屏 + 系统分享)
- [ ] Passkey 生物认证 (Face ID / 指纹)
- [ ] 推送通知 (节点离线/容器停止/SSL 过期/部署完成)
- [ ] 多节点切换
- [ ] 国际化 (en-US / zh-CN)
- [ ] App Store / Google Play 上架

**交付物**: iOS + Android App，与 Passim API 完全对接

**后端支持 (Passim 侧):**
- [ ] `POST /api/push/register` — 注册推送 token
- [ ] `GET/PUT /api/push/settings` — 通知偏好
- [ ] Web UI 设置页生成"连接二维码" (地址 + API Key 编码)

**云服务商直连 (App 端):**
- [ ] CloudProvider 能力模型 (Capability: compute/storage/tunnel/dns)
- [ ] Vultr 适配 (compute + storage)
- [ ] DigitalOcean 适配 (compute + storage)
- [ ] Hetzner Cloud 适配 (compute + storage)
- [ ] AWS Lightsail 适配 (compute + storage, SigV4 签名)
- [ ] Linode (Akamai) 适配 (compute + storage)
- [ ] Cloudflare 适配 (storage R2 + tunnel + dns)
- [ ] 云账号管理 (绑定/验证/删除 API Key，SecureStore 加密)
- [ ] 一键购买 VPS + cloud-init 自动部署 Passim
- [ ] 创建进度状态机 (创建→启动→安装→连接→完成)
- [ ] 云端 VPS 管理 (开关机/重启/销毁)
- [ ] 一键开通 S3 兼容存储 (Vultr / DO / Hetzner / Linode / Lightsail / Cloudflare R2)
- [ ] Cloudflare Tunnel 接入 (免开端口暴露 Passim 到公网)
- [ ] 新手全引导向导 (从零到 VPN 可用)

**其他增强:**
- [ ] 多用户 + 密码登录 + RBAC
- [ ] Web Terminal (xterm.js)
- [ ] 灰度发布
- [ ] 审计日志
- [ ] DNS 服务器 Go 重写 (可选)

---

## 九、风险与对策

| 风险 | 对策 |
|------|------|
| SQLite 并发写入限制 | WAL 模式 + 单机场景并发低，不是问题 |
| WebSocket 穿透防火墙 | 支持通过 HTTPS 端口复用 (同一端口 8443) |
| Docker socket 安全风险 | 与当前 Passim 风险一致，未来可考虑 rootless Docker |
| 前端嵌入增大镜像体积 | 静态文件 gzip 后 < 500KB，Go 二进制 ~20MB，总镜像 < 50MB |
| 旧系统迁移 | 编写迁移脚本，支持新旧并行运行 |
| 对等网络无权威源 | 每个节点管好自己的数据，远程操作是 "请求" 而非 "同步" |

---

## 十、成功标准

- [ ] `docker run` 一行启动，3 分钟内可用
- [ ] 单个 Docker 容器 = 完整功能 (API + Web UI + 多节点)
- [ ] Docker 镜像 < 50MB
- [ ] 内存占用 < 50MB (空闲)
- [ ] 所有现有功能对等可用
- [ ] 新增应用只需添加 YAML 模板
- [ ] 任意节点可连接管理其他节点
- [ ] 前端 Lighthouse 性能 > 90
- [ ] 核心 API 测试覆盖率 > 80%
- [ ] 手机 App: 扫码添加节点 < 30 秒完成
- [ ] 手机 App: VPN 配置一键导入到客户端 App
- [ ] 手机 App: iOS + Android 双平台上架
