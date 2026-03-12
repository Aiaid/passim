# Passim 服务详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 使用

---

## 概述

Passim 是运行在每台 VPS 上的统一管理服务。单个 Docker 容器包含: Go 后端 API + 嵌入式 Web UI + 本地 Docker 管理 + 远程节点管理。每个实例既能独立工作，也能连接管理其他实例。

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

#### API Key 登录

```
POST /api/auth/login
  Request:  { "api_key": "xxx" }
  Response: { "token": "eyJ...", "expires_at": "2026-03-19T..." }

POST /api/auth/refresh
  Request:  { "token": "current-jwt" }
  Response: { "token": "new-jwt", "expires_at": "..." }
```

#### Passkey (WebAuthn/FIDO2) 登录

```
POST /api/auth/passkey/begin
  Response: { WebAuthn PublicKeyCredentialRequestOptions }

POST /api/auth/passkey/finish
  Request:  { WebAuthn AuthenticatorAssertionResponse }
  Response: { "token": "eyJ...", "expires_at": "..." }
```

Passkey 需要先通过 API Key 登录后在设置页注册，之后可直接使用指纹/面容/安全密钥登录。

#### Passkey 管理 (需已登录)

```
GET    /api/auth/passkeys                → [{ id, name, created_at, last_used_at }]
POST   /api/auth/passkey/register        → { WebAuthn PublicKeyCredentialCreationOptions }
POST   /api/auth/passkey/register/finish  → { "ok": true }
DELETE /api/auth/passkeys/:id
```

#### API Key 管理 (需已登录)

```
GET    /api/settings/api-key             → { "prefix": "ak_7f3d", "created_at": "..." }
POST   /api/settings/api-key/regenerate  → { "api_key": "ak_..." }  ← 仅此一次返回明文
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

#### Go 依赖

```
github.com/go-webauthn/webauthn   -- WebAuthn/FIDO2
golang.org/x/crypto/bcrypt        -- API Key hash
```

### 系统状态

#### `GET /api/status`

```json
{
  "node": {
    "id": "uuid",
    "name": "my-vps-tokyo",
    "version": "1.0.0",
    "uptime": 864000
  },
  "system": {
    "cpu": { "usage_percent": 23.5, "cores": 4, "model": "Intel Xeon E5-2680" },
    "memory": { "total_bytes": 8589934592, "used_bytes": 3221225472, "usage_percent": 37.5 },
    "disk": { "total_bytes": 107374182400, "used_bytes": 42949672960, "usage_percent": 40.0 },
    "network": { "rx_bytes": 104857600, "tx_bytes": 52428800, "rx_rate": 1048576, "tx_rate": 524288 },
    "load": { "load1": 0.5, "load5": 0.8, "load15": 0.6 },
    "os": "Ubuntu 22.04.3 LTS",
    "kernel": "5.15.0-91-generic"
  },
  "containers": { "running": 5, "stopped": 1, "total": 6 },
  "services": {
    "ssl": { "status": "valid", "expires_at": "2026-06-15T00:00:00Z" },
    "speedtest": { "status": "running" },
    "dns": { "status": "ok", "resolved_ip": "203.0.113.10" }
  },
  "remote_nodes": { "connected": 2, "total": 3 }
}
```

#### `GET /api/metrics/stream` (SSE)

```
event: metrics
data: {"cpu":23.5,"memory":37.5,"network":{"rx_rate":1048576,"tx_rate":524288},"load1":0.5,"timestamp":"2026-03-12T10:00:05Z"}
```

每 5 秒推送一次。

### 容器管理

#### `GET /api/containers`

```json
{
  "containers": [
    {
      "id": "abc123",
      "name": "wireguard",
      "image": "linuxserver/wireguard:latest",
      "status": "running",
      "created_at": "2026-03-10T08:00:00Z",
      "uptime": 172800,
      "ports": [{"host": 51820, "container": 51820, "protocol": "udp"}],
      "labels": { "io.passim": "vpn", "io.passim.app": "wireguard" },
      "stats": { "cpu_percent": 2.1, "memory_bytes": 52428800 }
    }
  ]
}
```

#### `POST /api/containers/:name/stop|start|restart`

```json
{ "ok": true, "message": "Container wireguard stopped" }
```

#### `DELETE /api/containers/:name?volumes=true`

```json
{ "ok": true, "message": "Container wireguard removed" }
```

#### `GET /api/containers/:name/logs?lines=200&follow=false`

非 follow: 返回纯文本。
follow=true: 返回 SSE 流。

### 应用管理

#### `GET /api/templates`

```json
{
  "templates": [
    {
      "name": "wireguard",
      "category": "vpn",
      "version": "1.0.0",
      "icon": "shield",
      "description": "基于 WireGuard 协议的点对点 VPN",
      "settings": [
        { "key": "peers", "type": "number", "min": 1, "max": 25, "default": 1, "label": "对等节点数" }
      ]
    }
  ]
}
```

#### `POST /api/apps`

```json
// Request
{ "template": "wireguard", "settings": { "peers": 5 } }

// Response
{ "id": "app-uuid", "status": "deploying" }
```

#### `GET /api/apps/:id/events` (SSE)

```
event: progress
data: {"stage":"pulling","message":"Pulling linuxserver/wireguard:latest","percent":45}

event: progress
data: {"stage":"starting","message":"Starting container...","percent":90}

event: complete
data: {"status":"running","container_id":"def456"}
```

#### `GET /api/apps/:id/configs`

```json
{
  "configs": [
    { "name": "peer1.conf", "format": "conf", "download_url": "/api/apps/xxx/configs/peer1.conf" },
    { "name": "peer2.conf", "format": "conf", "download_url": "/api/apps/xxx/configs/peer2.conf" }
  ]
}
```

#### `GET /api/apps/:id/configs/:filename`

返回文件内容 (`Content-Type: application/octet-stream`)。

### 远程节点管理

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

### 被管理端 API

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

## WebSocket 协议

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

### `/data/config.yaml`

```yaml
node:
  name: ""             # 用户可修改
  port: 8443

auth:
  api_key: "auto-generated"    # 明文仅首次启动输出到日志，数据库存 hash

ssl:
  enabled: true
  cert_path: "/data/ssl/cert.pem"
  key_path: "/data/ssl/key.pem"

docker:
  socket: "unix:///var/run/docker.sock"

metrics:
  interval: 5s

log:
  level: info          # debug / info / warn / error
  format: json
```

首次启动自动生成，用户可通过环境变量覆盖:

```bash
docker run -d \
  -e PASSIM_NODE_NAME="tokyo-1" \
  -e PASSIM_AUTH_API_KEY="my-custom-key" \
  -e PASSIM_LOG_LEVEL="debug" \
  ...
```

CLI 子命令:

```
passim                     # 正常启动
passim reset-api-key       # 重置节点 API Key
passim reset-passkeys      # 清除所有 Passkey
passim reset-all           # 全部重置 (API Key + Passkey + JWT)
passim version             # 版本信息
```

---

## 初始化流程

```
docker run passim/passim
    │
    ▼
[1] 检测 /data/config.yaml 是否存在
    ├─ 不存在 → 首次安装
    │   ├─ 生成节点 ID + API Key
    │   ├─ 写入 config.yaml
    │   └─ 标记 setup_required = true
    └─ 存在 → 正常启动
    │
    ▼
[2] 初始化 SQLite (WAL 模式，自动迁移)
    │
    ▼
[3] 加载应用模板 (/etc/passim/templates/*.yaml)
    │
    ▼
[4] 检测 Docker socket 可用性
    │  ✗ → 打印错误，容器管理功能不可用
    ▼
[5] 如果 setup_required:
    ├─ 部署 Speedtest 容器
    ├─ 部署 SWAG 容器 (SSL)
    ├─ 等待 SSL 证书 (最多 120s，失败则用自签)
    └─ 标记 setup_complete
    │
    ▼
[6] 启动 HTTP 服务 (API + 静态文件 + WebSocket)
    │
    ▼
[7] 恢复远程节点连接 (重连 remote_nodes 表中的所有节点)
    │
    ▼
[8] 启动任务队列消费者
    │
    ▼
[9] 日志输出:
    "Passim started on https://0.0.0.0:8443"
    "API Key: xxxxx"
    "Register a Passkey in Settings for convenient login"
```

---

## 自我更新

```bash
# 容器内检查更新
GET https://releases.passim.io/latest → { "version": "1.1.0", "image": "passim/passim:1.1.0" }

# 如果有新版本:
1. Pull 新镜像: docker pull passim/passim:1.1.0
2. 创建新容器 (相同 volume 挂载)
3. 停止旧容器
4. 启动新容器
5. 健康检查通过 → 删除旧容器
   健康检查失败 → 回滚到旧容器
```

用户也可手动更新:
```bash
docker pull passim/passim:latest
docker stop passim && docker rm passim
docker run -d ... passim/passim:latest  # 相同参数
```

---

## 错误处理

```json
{
  "error": {
    "code": "CONTAINER_NOT_FOUND",
    "message": "Container 'wireguard' not found"
  }
}
```

| Code | HTTP | 说明 |
|------|------|------|
| `AUTH_REQUIRED` | 401 | 未认证 |
| `AUTH_INVALID` | 401 | API Key / JWT / Passkey 无效 |
| `PASSKEY_NOT_FOUND` | 404 | Passkey 不存在 |
| `WEBAUTHN_FAILED` | 400 | WebAuthn 验证失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONTAINER_NOT_FOUND` | 404 | 容器不存在 |
| `APP_NOT_FOUND` | 404 | 应用不存在 |
| `TEMPLATE_NOT_FOUND` | 404 | 模板不存在 |
| `NODE_NOT_FOUND` | 404 | 远程节点不存在 |
| `NODE_DISCONNECTED` | 503 | 远程节点离线 |
| `NODE_TIMEOUT` | 504 | 远程节点响应超时 |
| `ALREADY_EXISTS` | 409 | 资源已存在 |
| `DEPLOY_FAILED` | 500 | 部署失败 |
| `DOCKER_ERROR` | 500 | Docker Engine 错误 |

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
