# Passim 服务详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 使用

---

## 概述

Passim 是面向普通人的个人云管理助手——你的 VPS 管家。

用户不需要理解 Docker、配置文件或命令行。他们看到的是：一个干净的 Web 界面，可以一键部署 VPN、网盘、远程桌面，查看服务器状态，下载配置扫码连接。

技术上，Passim 是运行在每台 VPS 上的单一 Docker 容器，包含: Go 后端 API + 嵌入式 Web UI + 本地 Docker 管理 + 远程节点管理。每个实例既能独立工作，也能连接管理其他实例。但这些对用户是透明的。

---

## 容器结构

```
Docker Container: passim/passim
┌──────────────────────────────────────────────────┐
│                   Go Binary                       │
│                                                  │
│  ┌─────────────┐  ┌───────────┐  ┌────────────┐ │
│  │  HTTP API   │  │  Static   │  │  WebSocket │ │
│  │  (Gin)      │  │  File Srv │  │  Hub       │ │
│  │  /api/*     │  │  /* (SPA) │  │  /ws/node  │ │
│  │  :8443      │  │           │  │            │ │
│  └──────┬──────┘  └───────────┘  └──────┬─────┘ │
│         │                               │        │
│  ┌──────▼──────────────────────────────▼──────┐ │
│  │              Core Engine                    │ │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │ │
│  │  │ Docker  │ │ Template │ │   Metrics   │  │ │
│  │  │ Manager │ │  Engine  │ │ (gopsutil)  │  │ │
│  │  └─────────┘ └──────────┘ └─────────────┘  │ │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │ │
│  │  │  Task   │ │  Node    │ │   Setup     │  │ │
│  │  │  Queue  │ │  Hub     │ │  Manager    │  │ │
│  │  └─────────┘ └──────────┘ └─────────────┘  │ │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │ │
│  │  │   SSL   │ │Speedtest │ │    Auth     │  │ │
│  │  │autocert│ │HTTP+iperf│ │ Key+Passkey │  │ │
│  │  └─────────┘ └──────────┘ └─────────────┘  │ │
│  └─────────────────────┬──────────────────────┘ │
│                        │                         │
│              ┌─────────▼─────────┐               │
│              │   SQLite (WAL)    │               │
│              │   /data/passim.db │               │
│              └───────────────────┘               │
└──────────────────────────────────────────────────┘
     │
     ▼ /var/run/docker.sock
  [Docker Engine]
```

---

## API 详细设计

### 认证

用户登录支持两种方式: **API Key** (主要/首次) + **Passkey** (便捷/日常)。不使用密码登录。
节点间 WebSocket 通信使用 API Key 直接认证 (不走 JWT)。

#### API Key 登录 ✅ Phase 1

```
POST /api/auth/login
  Request:  { "api_key": "psk_xxx" }
  Response: { "token": "eyJ...", "expires_at": "2026-03-19T..." }

POST /api/auth/refresh
  Request:  (Authorization: Bearer <current-jwt>)
  Response: { "token": "new-jwt", "expires_at": "..." }
```

#### Passkey (WebAuthn/FIDO2) 登录 ✅ Phase 2

```
GET    /api/auth/passkeys/exists          # 检查是否有已注册 Passkey (公开)
POST   /api/auth/passkey/begin            # 开始登录 (公开)
POST   /api/auth/passkey/finish           # 完成登录 (公开)
```

#### Passkey 管理 ✅ Phase 2

```
GET    /api/auth/passkeys                 # Passkey 列表 (需认证)
POST   /api/auth/passkey/register         # 开始注册 (需认证)
POST   /api/auth/passkey/register/finish  # 完成注册 (需认证)
DELETE /api/auth/passkeys/:id             # 删除 Passkey (需认证)
```

#### API Key 管理 (需已登录) — Phase 2

```
GET    /api/settings/api-key             → { "prefix": "psk_7f3d", "created_at": "..." }
POST   /api/settings/api-key/regenerate  → { "api_key": "psk_..." }  ← 仅此一次返回明文
```

重新生成 API Key 会:
1. 关闭所有入站 WebSocket 连接 (远程管理方需用新 key 重新添加)
2. 吊销所有已签发 JWT (auth_version +1)

#### CLI 应急重置

```bash
docker exec passim passim reset-api-key    # 重置 API Key
docker exec passim passim reset-passkeys   # 清除所有 Passkey
docker exec passim passim reset-all        # 全部重置
```

#### 通用规则

所有其他 API 需携带:
```
Authorization: Bearer <jwt-token>
```

JWT 有效期 7 天，API Key 永久有效 (可重置)。
auth_version (config 表) 用于 JWT 吊销: 每次重置 API Key 或调用 reset-all 时 +1，旧 JWT 验证失败。

#### Go 依赖 (Phase 1 已使用)

```
github.com/gin-gonic/gin          -- HTTP 框架
github.com/mattn/go-sqlite3       -- SQLite 驱动
github.com/docker/docker           -- Docker SDK
github.com/shirou/gopsutil/v4     -- 系统指标
github.com/google/uuid             -- UUID 生成
crypto/sha256                     -- API Key hash
crypto/rsa + crypto/x509          -- 自签 SSL 证书
```

#### Go 依赖 (Phase 2 已使用)

```
github.com/go-webauthn/webauthn   -- WebAuthn/FIDO2 (Passkey) ✅
golang.org/x/crypto/acme/autocert -- ACME 客户端 (Let's Encrypt) ✅
```

> iperf3: 使用 Alpine 系统包 `iperf3`，Go 通过 `os/exec` 调用命令行

### 系统状态 ✅ Phase 1

#### `GET /api/status`

```json
{
  "node": {
    "id": "uuid",
    "name": "my-vps-tokyo",
    "version": "1.0.0",
    "uptime": 864000,
    "public_ip": "203.0.113.10",
    "public_ip6": "2001:db8::1",
    "country": "JP",
    "latitude": 35.6762,
    "longitude": 139.6503
  },
  "system": {
    "cpu": { "usage_percent": 23.5, "cores": 4, "model": "Intel Xeon E5-2680" },
    "memory": { "total_bytes": 8589934592, "used_bytes": 3221225472, "usage_percent": 37.5 },
    "disk": { "total_bytes": 107374182400, "used_bytes": 42949672960, "usage_percent": 40.0 },
    "network": { "rx_bytes": 104857600, "tx_bytes": 52428800 },
    "load": { "load1": 0.5, "load5": 0.8, "load15": 0.6 },
    "os": "Ubuntu 22.04.3 LTS",
    "kernel": "5.15.0-91-generic"
  },
  "containers": { "running": 5, "stopped": 1, "total": 6 }
}
```

> Phase 1 实现不含 `services` 和 `remote_nodes` 字段。`network` 不含 rate 字段。这些将在 Phase 2/3 补充。
> `public_ip` / `public_ip6` / `country` 在首次请求时懒加载 (sync.Once)，通过外部服务发现 (api4.ipify.org / api6.ipify.org)，国家通过 ip-api.com 查询。

#### `GET /api/stream` (统一 SSE) ✅ Phase 1

单一 SSE 连接，通过 event name 区分数据类型。连接建立时立即推送全量快照。

| SSE event name | 推送方式 | Payload |
|---|---|---|
| `metrics` | 5s 定时 | `SystemMetrics` JSON |
| `status` | 30s 定时 | `statusResponse` JSON |
| `containers` | 10s 定时 | `[]Container` JSON |
| `apps` | 15s 定时 | `[]appResponse` JSON |
| `task:{id}` | 实时 (Broker) | `{"type":"...","data":{...}}` |
| `app:{id}` | 实时 (Broker) | `{"type":"...","data":{...}}` |

```
event: metrics
data: {"hostname":"...","cpu_percent":23.5,"mem_percent":37.5,...}

event: status
data: {"node":{...},"system":{...},"containers":{...}}

event: containers
data: [{"id":"abc","name":"nginx","state":"running",...}]

event: apps
data: [{"id":"...","template":"wireguard","status":"running",...}]

event: app:abc-123
data: {"type":"deploy","data":{"status":"running"}}
```

> 后端使用 `http.ResponseController` 禁用 SSE 连接的 WriteDeadline。metrics 收集在独立 goroutine 中运行（~1s 阻塞不影响其他事件推送）。status 事件复用 metrics 缓存避免重复采集。

#### `GET /api/metrics/stream` (SSE, legacy) ✅ Phase 1

```
event: metrics
data: {"hostname":"...","cpu_percent":23.5,"mem_percent":37.5,...,"timestamp":"2026-03-12T10:00:05Z"}
```

立即发送一次初始指标，之后每 5 秒推送一次。SSE 格式 (`text/event-stream`)。已被 `/api/stream` 替代，保留用于向后兼容。

### 容器管理 ✅ Phase 1

#### `GET /api/containers`

返回 Docker 容器列表（数组，非包装对象）。

```json
[
  {
    "id": "abc123",
    "name": "wireguard",
    "image": "linuxserver/wireguard:latest",
    "state": "running",
    "status": "Up 2 days",
    "labels": { "io.passim.app": "wireguard" }
  }
]
```

#### `POST /api/containers/:id/start|stop|restart`

```json
{ "status": "started" }
{ "status": "stopped" }
{ "status": "restarted" }
```

#### `DELETE /api/containers/:id`

```json
{ "status": "removed" }
```

#### `GET /api/containers/:id/logs?lines=200`

返回纯文本日志（Content-Type: text/plain）。默认 200 行。

### 应用管理 ✅ Phase 1

#### `GET /api/templates`

返回模板数组。

```json
[
  {
    "name": "wireguard",
    "category": "vpn",
    "version": "1.0.0",
    "icon": "shield",
    "description": { "zh-CN": "...", "en-US": "..." },
    "settings": [
      { "key": "peers", "type": "number", "min": 1, "max": 25, "default": 3 }
    ]
  }
]
```

#### `POST /api/apps`

```json
// Request
{ "template": "wireguard", "settings": { "peers": 5 } }

// 异步响应 (task queue 启用时) — 202
{ "id": "app-uuid", "template": "wireguard", "settings": {...}, "status": "deploying", "task_id": "task-uuid" }

// 同步响应 (无 task queue) — 201
{ "id": "app-uuid", "template": "wireguard", "settings": {...}, "status": "running", "container_id": "abc123" }
```

#### `GET /api/apps`

返回应用数组。

```json
[{ "id": "...", "template": "wireguard", "settings": {...}, "status": "running", "container_id": "...", "deployed_at": "...", "updated_at": "..." }]
```

#### `GET /api/apps/:id`

返回单个应用详情，结构同数组元素。

#### `PATCH /api/apps/:id`

```json
// Request
{ "settings": { "peers": 8 } }
// Response: 更新后的应用详情
```

#### `DELETE /api/apps/:id`

```json
// 异步 — 202
{ "status": "undeploying", "task_id": "task-uuid" }

// 同步 — 200
{ "status": "deleted" }
```

#### `GET /api/apps/:id/events` (SSE, legacy) ✅ Phase 1

```
event: progress
data: {"status":"running","progress":50}

event: deploy
data: {"status":"running"}
```

当 SSE broker 未启用时返回 503。已被 `/api/stream` 的 `app:{id}` 事件替代，保留用于向后兼容。

#### `GET /api/apps/:id/configs`

返回配置文件名数组。

```json
["config.yaml", "peer1.conf"]
```

#### `GET /api/apps/:id/configs/:filename`

返回文件内容 (`Content-Type: text/plain; charset=utf-8`)。包含路径穿越保护。

### 任务管理 ✅ Phase 1

#### `GET /api/tasks`

返回任务数组。

```json
[{ "id": "...", "type": "deploy", "ref_id": "app-uuid", "status": "completed", "payload": "...", "result": "...", "created_at": "...", "updated_at": "..." }]
```

#### `GET /api/tasks/:id`

返回单个任务详情。404 if not found。

#### `GET /api/tasks/:id/events` (SSE, legacy)

订阅 `task:{id}` topic 的 SSE 事件流。当 SSE broker 未启用时返回 503。已被 `/api/stream` 的 `task:{id}` 事件替代，保留用于向后兼容。

### 测速 ✅ Phase 1

#### `GET /api/speedtest/download` (公开，无需认证)

返回随机数据流，前端计算下载速度。
```
Content-Type: application/octet-stream
Content-Length: 104857600  (100MB, 可通过 ?size= 调整，支持 mb 后缀)
```

#### `POST /api/speedtest/upload` (公开，无需认证)

接收上传数据，返回测速结果。
```json
{ "bytes": 52428800, "duration_ms": 1250, "speed_mbps": 335.5 }
```

#### `GET /api/speedtest/ping` (公开，无需认证)

```json
{ "timestamp": "2026-03-12T10:00:00.000Z" }
```

前端连续请求多次，计算 RTT 和 jitter。

#### `GET /api/speedtest/iperf/status` (需认证)

```json
{ "status": "ready" }
```

#### `POST /api/speedtest/iperf/start` (需认证) ✅ Phase 2

启动 iperf3 服务端进程。

```json
{ "status": "started" }
```

#### `POST /api/speedtest/iperf/stop` (需认证) ✅ Phase 2

停止 iperf3 服务端进程。

```json
{ "status": "stopped" }
```

#### `POST /api/speedtest/iperf` — Phase 3 (远程节点)

> iperf3 客户端模式（节点间测速）计划在 Phase 3 实现。

### SSL 证书管理 ✅ Phase 1

#### `GET /api/ssl/status`

```json
{
  "mode": "self-signed",
  "valid": true,
  "domain": "example.com",
  "expires_at": "2027-03-13T00:00:00Z",
  "issuer": "Passim Self-Signed"
}
```

#### `POST /api/ssl/renew`

auto 模式触发证书续期（删除缓存强制重签），其他模式返回提示信息。✅ 已实现。

#### `POST /api/ssl/upload`

自定义证书上传，接受 multipart form（cert + key 文件）。✅ 已实现。

### 节点设置 ✅ Phase 2

#### `GET /api/settings`

```json
{ "node_name": "my-vps-tokyo" }
```

#### `PATCH /api/settings`

```json
// Request
{ "node_name": "new-name" }
// Response
{ "ok": true }
```

`node_name` 最长 64 字符，空字符串表示使用系统 hostname。

---

### 远程节点管理 — Phase 3

#### `POST /api/nodes` (添加远程节点)

```json
// Request
{ "address": "vps-b.example.com:8443", "api_key": "xxx", "name": "tokyo-2" }

// Response
{
  "id": "node-uuid",
  "name": "tokyo-2",
  "address": "vps-b.example.com:8443",
  "status": "connecting"
}
```

添加后自动建立 WebSocket 连接，连接成功后 status → `connected`。

#### `GET /api/nodes`

```json
{
  "nodes": [
    {
      "id": "node-uuid",
      "name": "tokyo-2",
      "address": "vps-b.example.com:8443",
      "status": "connected",
      "country": "JP",
      "last_seen": "2026-03-12T10:00:00Z",
      "metrics": {
        "cpu": 15.2, "memory": 45.0, "containers": { "running": 3, "total": 4 }
      }
    }
  ]
}
```

#### `GET /api/nodes/:id/status|containers|apps|...`

通过 WebSocket 代理请求到远程节点，返回格式与本地 API 一致。

#### `POST /api/nodes/:id/apps` (远程部署)

```json
{ "template": "wireguard", "settings": { "peers": 3 } }
```

通过 WebSocket 发送部署任务到远程节点，进度通过 SSE 推送。

#### 批量部署

```json
POST /api/batch/deploy
{
  "template": "wireguard",
  "settings": { "peers": 3 },
  "targets": ["local", "node-uuid-1", "node-uuid-2"]
}
// "local" = 本机

// Response
{
  "task_id": "batch-uuid",
  "deployments": [
    { "target": "local", "status": "deploying" },
    { "target": "node-uuid-1", "status": "queued" },
    { "target": "node-uuid-2", "status": "queued" }
  ]
}
```

### 被管理端 API — Phase 3

#### `GET /ws/node?key=<api_key>` (WebSocket 连接端点)

远程 Passim 连接此端点来管理本节点。

#### `GET /api/connections` (查看谁连接了我)

```json
{
  "connections": [
    {
      "id": "conn-uuid",
      "remote_ip": "203.0.113.10",
      "connected_at": "2026-03-12T08:00:00Z"
    }
  ]
}
```

#### `DELETE /api/connections/:id` (断开某个连接)

---

## WebSocket 协议 — Phase 3

### 消息格式

```json
{
  "type": "heartbeat|request|response|event",
  "id": "msg-uuid",
  "timestamp": "2026-03-12T10:00:00Z",
  "payload": {}
}
```

### 被管端 → 管理端

**心跳 (每 10s):**
```json
{
  "type": "heartbeat",
  "payload": {
    "metrics": { "cpu": 23.5, "memory": 37.5, "disk": 40.0 },
    "containers": [
      { "name": "wireguard", "status": "running", "cpu": 2.1, "memory": 52428800 }
    ]
  }
}
```

**事件 (状态变更时):**
```json
{
  "type": "event",
  "payload": {
    "event": "container_stopped",
    "data": { "name": "wireguard", "reason": "user_action" }
  }
}
```

### 管理端 → 被管端

**请求 (代理 API 调用):**
```json
{
  "type": "request",
  "id": "req-uuid",
  "payload": {
    "method": "GET",
    "path": "/api/containers",
    "body": null
  }
}
```

**响应:**
```json
{
  "type": "response",
  "id": "req-uuid",
  "payload": {
    "status": 200,
    "body": { "containers": [...] }
  }
}
```

### 重连策略

```
断线 → 立即重试 → 1s → 2s → 4s → 8s → ... (上限 60s)
重连成功 → 重新发送状态快照
```

---

## 配置

Passim 不使用配置文件——所有配置通过**环境变量**传入，运行时状态存储在 SQLite 中。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8443` | 监听端口 |
| `API_KEY` | (自动生成) | 预设 API Key；省略则首次启动自动生成并打印到日志 |
| `SSL_MODE` | `self-signed` | SSL 模式：`self-signed` / `letsencrypt` / `off` |
| `SSL_DOMAIN` | — | 域名，用于 Let's Encrypt 证书签发（最高优先级） |
| `SSL_EMAIL` | — | Let's Encrypt 联系邮箱 |
| `DNS_BASE_DOMAIN` | — | DNS 反射器基础域名；未设 `SSL_DOMAIN` 时自动发现公网 IP 拼域名 |
| `DATA_DIR` | `/data` | 数据目录（SQLite、配置、证书） |

### SSL 模式说明

| 模式 | 行为 |
|------|------|
| `self-signed` | 自动生成自签证书到 `/data/certs/`（默认） |
| `letsencrypt` | ACME 自动申请 Let's Encrypt 证书，需设置 `SSL_DOMAIN` 或 `DNS_BASE_DOMAIN` |
| `off` | 纯 HTTP，不启用 TLS（开发模式） |

**Let's Encrypt 域名优先级：**
1. 设了 `SSL_DOMAIN` → 直接使用，DNS 反射不触发
2. 未设 `SSL_DOMAIN`，设了 `DNS_BASE_DOMAIN` → 自动发现公网 IP，Base32 编码拼成域名（如 `ywahcia8.dns.passim.io`）
3. 两个都未设 → 报错

### Docker Compose

```yaml
# passim/docker-compose.yml
services:
  passim:
    build:
      context: ..
      dockerfile: passim/Dockerfile
    ports:
      - "8443:8443"        # Main HTTPS/HTTP port
      - "80:80"            # ACME challenge + HTTP→HTTPS redirect
      - "5201:5201"        # iperf3 speed test
    volumes:
      - passim-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - PORT=8443
      - SSL_MODE=self-signed
      # - API_KEY=your-secret-key
      # - SSL_DOMAIN=example.com
      # - SSL_EMAIL=you@example.com
      # - DNS_BASE_DOMAIN=dns.passim.io
```

### 运行时存储 (SQLite `config` 表)

| Key | 说明 |
|-----|------|
| `node_id` | 节点 UUID，首次启动自动生成 |
| `node_name` | 节点显示名称，空则使用系统 hostname |
| `api_key_hash` | API Key 的 SHA256 哈希 |
| `jwt_secret` | JWT 签名密钥 |
| `auth_version` | 认证版本号，重置 API Key 时 +1 用于吊销旧 JWT |

CLI 子命令:

```
passim                     # 正常启动
passim --version           # 版本信息 (e.g. "passim v1.0.0 (abc1234) built 2026-03-17")
passim update-exec         # 更新切换 (helper 容器内部使用，用户不直接调用)
passim reset-api-key       # 重置节点 API Key
passim reset-passkeys      # 清除所有 Passkey
passim reset-all           # 全部重置 (API Key + Passkey + JWT)
```

---

## 初始化流程

```
docker run passim/passim
    │
    ▼
[1] 初始化 SQLite (WAL 模式，自动迁移)
    │
    ▼
[2] 首次启动检测 (config 表无 node_id)
    ├─ 生成节点 UUID
    ├─ 生成 API Key (或使用 API_KEY 环境变量)
    │   └─ 存储 SHA256 哈希，明文仅打印一次
    ├─ 生成 JWT 签名密钥
    └─ 设置 auth_version = 1
    │
    ▼
[3] 加载应用模板 (/etc/passim/templates/*.yaml)
    │
    ▼
[4] 检测 Docker socket 可用性
    │  ✗ → 打印警告，容器管理功能不可用
    ▼
[5] 初始化 SSL (根据 SSL_MODE 环境变量):
    ├─ self-signed → 生成自签证书到 /data/certs/
    ├─ letsencrypt → autocert ACME，监听 :80 进行 HTTP-01 验证
    │   ├─ 有 SSL_DOMAIN → 直接使用
    │   └─ 有 DNS_BASE_DOMAIN → 自动发现公网 IP 拼域名
    └─ off → 跳过 TLS，纯 HTTP
    │
    ▼
[6] 启动任务队列消费者 (2 workers)
    │
    ▼
[7] 启动 HTTP(S) 服务 (API + 嵌入式 Web UI)
    │
    ▼
[8] 如果 SSL_MODE ≠ off: 启动 HTTP :80 (ACME challenge + HTTPS 重定向)
    │
    ▼
[9] 日志输出:
    "=== First-time setup complete ==="
    "Node ID : <uuid>"
    "API Key : <plaintext>"
    "Save this API Key — it will not be shown again."
```

---

## 版本与自我更新 ✅ Phase 4

### 版本信息

版本号通过 Go `-ldflags` 在编译时注入 (`internal/version` 包)。

#### `GET /api/version` (公开，无需认证)

```json
{
  "version": "v1.0.0",
  "commit": "abc1234",
  "build_time": "2026-03-17T10:00:00Z"
}
```

### 更新检查

#### `GET /api/version/check` (需认证)

查询 GitHub Releases API (`https://api.github.com/repos/{GITHUB_REPO}/releases/latest`)，结果有缓存。加 `?force=true` 强制刷新。

```json
{
  "current": "v1.0.0",
  "latest": "v1.1.0",
  "available": true,
  "changelog": "- Bug fixes\n- New feature",
  "published_at": "2026-03-17T10:00:00Z"
}
```

后台自动检查: 启动后 10 秒首次检查，之后每 24 小时检查一次。

### 触发更新

#### `POST /api/update` (需认证)

```json
// Request
{ "version": "v1.1.0" }

// Response — 200
{ "status": "updating", "message": "Update in progress. You will be disconnected briefly." }
```

### 更新执行流程

```
用户点击 [更新到 v1.1.0]
    │
    ▼
[1] Pull 新镜像: docker pull ghcr.io/passim/passim:v1.1.0
    │
    ▼
[2] Inspect 当前容器，提取 env/volumes/ports/labels 配置
    │
    ▼
[3] 启动 helper 容器 (使用新镜像):
    docker create --name passim-updater \
      -v /var/run/docker.sock:/var/run/docker.sock \
      ghcr.io/passim/passim:v1.1.0 \
      passim update-exec --target=<self-id> --name=passim --config=<base64>
    │
    ▼
[4] Helper 容器执行切换:
    a. docker stop passim
    b. docker rename passim → passim-old
    c. docker create --name passim (新镜像 + 原配置)
    d. docker start passim
    e. 健康检查 (GET /api/version，最多 60s)
    │
    ├── 成功 → docker rm passim-old
    └── 失败 → 回滚:
        docker stop passim (新) → docker rm passim (新)
        docker rename passim-old → passim
        docker start passim (旧)
```

用户也可手动更新:
```bash
docker pull ghcr.io/passim/passim:latest
docker stop passim && docker rm passim
docker run -d ... ghcr.io/passim/passim:latest  # 相同参数
```

---

## 错误处理

所有错误响应使用统一的简单格式，靠 HTTP 状态码区分错误类型：

```json
{ "error": "描述性错误信息" }
```

| HTTP 状态码 | 含义 | 示例 |
|------------|------|------|
| 400 | 请求无效 | `{"error": "invalid request body"}` |
| 401 | 未认证 | `{"error": "missing or invalid token"}` |
| 404 | 资源不存在 | `{"error": "app not found"}`, `{"error": "template not found: xxx"}` |
| 500 | 服务器内部错误 | `{"error": "deploy failed: ..."}` |
| 501 | 未实现 | `{"error": "auto renewal not yet implemented"}` |
| 503 | 服务不可用 | `{"error": "docker is not available"}`, `{"error": "SSE not available"}` |

---

## 性能指标

| 指标 | 目标 |
|------|------|
| Docker 镜像大小 | < 50 MB |
| 启动时间 (不含 setup) | < 2s |
| 内存占用 (空闲) | < 30 MB |
| 内存占用 (活跃 + 5 远程节点) | < 80 MB |
| API 响应 P95 (本地) | < 50ms |
| API 响应 P95 (远程代理) | < 500ms |
| 同时管理远程节点数 | 50+ |
| 指标采集开销 | < 1% CPU |
