# AC (Passim) 系统重写计划书

> 版本: 3.0 | 日期: 2026-03-12

### 相关文档

| 文档 | 说明 |
|------|------|
| [stories/](./stories/) | User Stories 与验收标准 (按 Epic 分文件) |
| [spec-passim.md](./spec-passim.md) | Passim 服务详细设计 (API/配置/多节点/CLI) |
| [spec-web.md](./spec-web.md) | Web 前端详细设计 (页面/组件/状态管理) |

---

## 一、现有系统概述

AC (Passim) 是一个分布式 VPS 管理与应用部署平台，用户通过 Web 控制台管理 VPS 实例、部署 VPN/存储/远程桌面等服务，后端通过 Docker 编排完成自动化运维。

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

**基础设施**: Let's Encrypt 自动 SSL (SWAG), Speedtest 测速, Glances 监控, DNS 健康检查, TOTP 认证, 多语言 (en-US/zh-CN)

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
10. **SSL 管理耦合** — SWAG 容器与 Passim 紧密耦合

---

## 三、重写目标

| 优先级 | 目标 | 说明 |
|--------|------|------|
| P0 | 单一服务 | 一个 Docker 容器 = 全部功能 (API + Web UI + 本地管理 + 远程节点管理) |
| P0 | 即装即用 | `docker run` 一行命令启动，开箱管理本机 |
| P0 | 对等多节点 | 任意 Passim 实例可连接其他实例，形成管理网络 |
| P0 | 可靠部署 | 异步任务 + 重试 + 进度推送 |
| P1 | 插件化应用 | YAML 模板定义应用，新增应用无需改代码 |
| P1 | 现代化前端 | Vite + React 19 + shadcn/ui + Tailwind CSS v4 |
| P1 | 可观测性 | 内置指标采集 (替代 Glances)，结构化日志 |
| P2 | 多用户 | 用户隔离、配额、RBAC |

---

## 四、新架构设计

### 核心理念：一个 Passim，对等互联

不再区分 "Node Service" 和 "Gateway"。每台 VPS 运行**同一个 Passim Docker 容器**，它既管理本机，也可以连接管理其他 VPS。

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
  -v passim-data:/data -p 8443:8443 passim/passim
# 访问 https://<ip>:8443 → 管理本机
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
| 4 个进程 + 数据库 | 1 个 Docker 容器 |

### Docker 容器结构

```dockerfile
FROM golang:1.23-alpine AS builder
# 编译 Go 后端 (内嵌静态前端文件)
COPY . .
RUN go build -o /passim ./cmd/passim/

FROM alpine:3.20
COPY --from=builder /passim /usr/local/bin/passim
COPY templates/ /etc/passim/templates/

VOLUME /data           # SQLite + 配置 + 应用数据
EXPOSE 8443

ENTRYPOINT ["passim"]
```

```bash
docker run -d \
  --name passim \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v passim-data:/data \
  -p 8443:8443 \
  passim/passim:latest
```

**Volume 挂载:**

| 路径 | 说明 |
|------|------|
| `/var/run/docker.sock` | Docker Engine 通信 (必须) |
| `/data/passim.db` | SQLite 数据库 |
| `/data/configs/` | 应用配置文件 (Wireguard conf 等) |
| `/data/ssl/` | SSL 证书 |

---

## 五、技术栈

### 后端 (Go)

| 类别 | 选择 | 理由 |
|------|------|------|
| 语言 | **Go 1.23** | 单二进制、高并发、Docker SDK 原生支持 |
| HTTP | **Gin** | 轻量框架 |
| 数据库 | **SQLite** (go-sqlite3, WAL) | 零配置嵌入式，每台 VPS 独立 |
| 容器 | **Docker SDK (Go)** | 直接调用 Docker Engine API |
| 指标 | **gopsutil** | 系统指标采集，替代 Glances 容器 |
| 多节点通信 | **WebSocket** (gorilla/websocket) | Passim 实例间双向通信 |
| 任务 | **内存队列** + SQLite 持久化 | 单机场景不需要 Redis |
| 前端嵌入 | **Go embed** | 静态文件打包进二进制 |
| 认证 | **JWT** + **API Key** + **WebAuthn** | API Key 登录 + Passkey 便捷登录，签发 JWT |
| 配置 | **Viper** | YAML 配置文件 |

### 前端 (Vite + React)

| 类别 | 选择 | 理由 |
|------|------|------|
| 构建 | **Vite 6** | 快，轻量，不需要 SSR |
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
│   ├── setup/                       # 初始化
│   │   ├── setup.go                 # 首次启动流程
│   │   ├── ssl.go                   # SWAG 部署
│   │   └── speedtest.go            # Speedtest 部署
│   └── auth/                        # 认证
│       ├── apikey.go                # API Key 管理
│       ├── jwt.go                   # JWT 签发/验证
│       └── webauthn.go              # Passkey (WebAuthn/FIDO2)
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
```

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
GET    /api/apps/:id/configs        # 客户端配置文件列表
GET    /api/apps/:id/configs/:file  # 下载配置文件
GET    /api/apps/:id/events         # SSE 部署进度
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

### Phase 1: Passim Core (5 周)

**目标**: Go 重写 Passim，单机可用

- [ ] Go 项目初始化 (Gin + SQLite + Docker SDK)
- [ ] 系统指标采集 (gopsutil，替代 Glances)
- [ ] Docker 容器管理 API (list/start/stop/rm/logs)
- [ ] 应用模板引擎 (YAML 解析 + 参数渲染 + Docker 部署)
- [ ] 迁移所有现有应用为 YAML 模板 (7 个)
- [ ] 配置导出 (conf/mobileconfig/yaml)
- [ ] API Key 认证 + Passkey (WebAuthn) + JWT
- [ ] SQLite 数据持久化
- [ ] 异步任务队列 (内存 + SQLite)
- [ ] 初始化 setup (SSL/Speedtest 自动部署)
- [ ] SSE 实时推送 (指标 + 部署进度)
- [ ] Dockerfile
- [ ] 单元测试

**交付物**: `docker run` 一行启动，可管理本机容器和应用 (无 Web UI，API-only)

### Phase 2: Web UI (4 周)

**目标**: Vite + React + shadcn/ui 前端

- [ ] 项目初始化 (Vite + React 19 + Tailwind v4 + shadcn/ui)
- [ ] 设计系统 (OKLCH 色彩 / 暗色模式)
- [ ] 登录页 (API Key + Passkey)
- [ ] Dashboard 总览 (节点状态 + 快速操作)
- [ ] 容器管理 (列表 + 操作 + 日志)
- [ ] 应用管理
  - 模板浏览
  - 部署向导 (动态表单)
  - 应用详情 + 配置导出 (下载/二维码)
- [ ] S3 凭证管理
- [ ] 设置页
- [ ] SSE 实时数据集成
- [ ] 国际化 (en-US / zh-CN)
- [ ] 响应式布局
- [ ] Go embed 嵌入 + 更新 Dockerfile

**交付物**: 功能完整的单机 Passim (API + Web UI)

### Phase 3: 多节点管理 (3 周)

**目标**: 对等互联，管理远程节点

- [ ] WebSocket 节点通信协议
  - 连接/认证/心跳/重连
  - 任务下发 + 结果回传
  - 指标实时推送
- [ ] Node Hub (管理端): 连接管理、状态聚合、请求代理
- [ ] Node Server (被管端): 接受连接、执行远程任务
- [ ] 远程节点 API (`/api/nodes/*`)
- [ ] 前端: 添加/移除远程节点
- [ ] 前端: 统一面板显示本地 + 远程节点
- [ ] 前端: 远程部署/操作
- [ ] 前端: 批量部署到多节点
- [ ] 安全: 连接授权管理 (查看/断开连接)

**交付物**: 完整的多节点 Passim

### Phase 4: 打磨 + 迁移 (2 周)

**目标**: 生产就绪

- [ ] MongoDB → SQLite 数据迁移脚本
- [ ] 旧 Passim → 新 Passim 替换脚本
- [ ] Docker Hub 自动构建 (GitHub Actions)
- [ ] 自我更新机制 (拉取新镜像 + 重启)
- [ ] 容器日志 (Sheet + 实时尾随 + 搜索)
- [ ] 监控历史图表 (最近 1h/6h/24h)
- [ ] 性能优化 + 安全审查
- [ ] 文档

**交付物**: 可从旧系统迁移的生产版本

### Phase 5: 增强功能 (持续)

- [ ] 多用户 + 密码登录 + RBAC
- [ ] Web Terminal (xterm.js)
- [ ] 灰度发布
- [ ] 审计日志
- [ ] 移动端适配
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
