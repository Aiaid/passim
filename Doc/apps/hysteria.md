# Hysteria 2

## 概述

基于 QUIC 协议的快速抗审查代理，适用于网络受限环境下的安全访问。Hysteria 2 以极高的传输速度和强大的抗封锁能力著称，支持自签 TLS 证书和 ACME 自动证书。

## 技术规格

- **Docker 镜像**: `tobyxdd/hysteria`
- **端口映射**: `{{settings.port}}:443/udp`（默认对外暴露 443/udp）
- **卷挂载**:
  - `{{node.data_dir}}/configs/hysteria:/etc/hysteria` — 配置文件存储
- **环境变量**: 无（通过配置文件配置）
- **启动参数 (Cmd)**: `server -c /etc/hysteria/config.yaml`
- **特殊要求**: 无额外 capabilities
- **配置文件**:
  - `{{node.data_dir}}/configs/hysteria/config.yaml` — Hysteria 2 服务端配置
- **重启策略**: unless-stopped
- **Labels**: `io.passim: vpn`, `io.passim.app: hysteria`

### 配置文件模板（当前 — 单用户模式）

```yaml
listen: :443
tls:
  cert: /etc/passim-ssl/cert.pem
  key: /etc/passim-ssl/key.pem
auth:
  type: password
  password: {{settings.password}}
masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
```

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `port` | number (1-65535) | `443` | 服务器监听的 UDP 端口 |
| `password` | string | `{{generated.password}}` (随机 32 位) | 客户端认证密码 |
| `domain` | string (advanced) | `""` | 用于 ACME 自动获取 TLS 证书的域名，留空则使用自签证书 |

## 用户故事

- **US-APP-3.1: 部署 Hysteria 2**
  - 作为用户，我想一键部署 Hysteria 2 代理
  - 验收标准: 容器运行，UDP 端口可访问，Hysteria 服务正常响应

- **US-APP-3.2: 连接 Hysteria 2**
  - 作为用户，我想从客户端连接到已部署的 Hysteria 2
  - 验收标准: 使用 Hysteria 2 客户端，配置服务器地址、端口和密码后可以成功连接

- **US-APP-3.3: 管理 Hysteria 2**
  - 作为用户，我想查看/修改/卸载 Hysteria 2
  - 验收标准: 密码和端口可修改，服务可停止/重启/删除

## 客户端配置

### 连接信息

- **协议**: Hysteria 2 (QUIC)
- **服务器**: `<服务器 IP>:<port>`
- **密码**: settings 中设置的 password
- **TLS**: 未提供域名时使用自签证书，客户端需启用 insecure 模式

### 推荐客户端

- **iOS**: Stash, Shadowrocket
- **Android**: NekoBox, Clash Meta for Android
- **Windows**: Clash Verge, nekoray
- **macOS**: Clash Verge, Stash

安装客户端后，使用服务器地址、端口和密码进行配置，然后连接。

## 已知限制

- 使用 UDP 协议，某些网络可能会阻止或限速 UDP 流量
- 未提供域名时使用自签 TLS 证书，客户端必须设置 insecure 模式
- **不支持多跳 VPN**: Hysteria 2 协议本身不支持 relay / chain proxy。客户端直连服务器，无法像 Tor 那样经过多个中继节点。服务端可以通过 outbound 配置将流量转发到下游代理（SOCKS5/HTTP），但这是单层转发，不是真正的多跳。如需多跳场景，建议在 hy2 之上叠加其他方案（如 hy2 → Xray chain）。

## 测试要求

- **模板渲染测试**: 验证 `port`、`password` 正确渲染到配置文件模板；验证 `generated.password`（random_string, length 32）正确生成；验证 `args` 正确传递
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括配置文件写入和 `args` 传递到 Docker Cmd
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `tobyxdd/hysteria` 镜像，启动容器，验证 Hysteria 服务启动并监听指定端口

---

## Phase 1 增强：流量统计 + 多用户 + 在线管理

### 目标

将 Hysteria 2 从单密码代理升级为多用户代理管理平台，支持：
- 多用户增删改查，每用户独立密码
- 实时流量统计（per-user 上下行流量）
- 在线状态监控（每用户连接数 ≈ 设备数）
- 踢用户下线
- 流量配额（可选）

### 认证方案：HTTP Auth Backend

**选择 `auth.type: http` 而非 `userpass` 的原因：**

| | `userpass` (config 里写死) | `http` (Passim 做认证后端) |
|---|---|---|
| 增删用户 | 改 config → 重启容器 | API 操作 SQLite，**不需要重启** |
| 用户数量 | 受限于 config 大小 | 无限制 |
| 复杂度 | 低（模板 config_edit） | 中（需要一个 HTTP 端点） |
| 配额/限速 | 不支持 | auth 响应时检查配额，可拒绝 |
| 动态性 | 差 | 优秀 |

**结论**: 对于 Passim 这种管理平台，HTTP auth 是正确选择。

### 架构设计

```
┌───────────────┐     UDP/QUIC      ┌──────────────────┐
│  Hysteria 2   │◄──────────────────│   客户端          │
│  Container    │                   │   (Stash/Clash)  │
└──────┬────────┘                   └──────────────────┘
       │
       │ POST /auth (每次连接)
       ▼
┌──────────────────────────────────────────────┐
│  Passim Go Backend                           │
│                                              │
│  /internal/hy2auth                           │
│    POST /hy2/auth  ← hy2 发认证请求          │
│    验证 user:pass → 查 SQLite                │
│    检查 enabled + 配额                        │
│    返回 {ok: true, id: "username"}           │
│                                              │
│  /internal/hy2stats                          │
│    定时轮询 hy2 trafficStats API             │
│    GET http://hy2-container:9999/traffic     │
│    GET http://hy2-container:9999/online      │
│    累计写入 SQLite                            │
│                                              │
│  /api/apps/:id/users     ← CRUD 用户         │
│  /api/apps/:id/traffic   ← 查流量统计        │
│  /api/apps/:id/kick      ← 踢用户            │
└──────────────────────────────────────────────┘
```

### Hysteria 2 配置文件（Phase 1 升级版）

```yaml
listen: :443

tls:
  cert: /etc/passim-ssl/cert.pem
  key: /etc/passim-ssl/key.pem

auth:
  type: http
  http:
    url: http://host.docker.internal:{{node.port}}/internal/hy2/auth
    insecure: false

trafficStats:
  listen: :9999
  secret: {{generated.stats_secret}}

masquerade:
  type: proxy
  proxy:
    url: {{settings.masquerade_url}}
    rewriteHost: true
```

**关键点：**
- `auth.http.url` 指向 Passim 自身的内部端点。容器通过 `host.docker.internal` 访问宿主机（Docker Desktop），或通过 Docker 网络直连
- `trafficStats` 开启内置统计 API，`secret` 用于鉴权
- `masquerade_url` 从 settings 读取，用户可自选伪装网站

### 数据库 Schema

```sql
-- 应用用户表 (通用，不仅限于 hy2)
CREATE TABLE app_users (
    id          TEXT PRIMARY KEY,  -- UUID
    app_id      TEXT NOT NULL,     -- 关联 apps 表
    username    TEXT NOT NULL,
    password    TEXT NOT NULL,     -- bcrypt hash 或明文（hy2 需要明文比对）
    enabled     INTEGER DEFAULT 1,
    quota_bytes INTEGER DEFAULT 0, -- 0 = 无限制
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
    UNIQUE(app_id, username)
);

-- 流量记录表
CREATE TABLE app_traffic_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id      TEXT NOT NULL,
    user_id     TEXT NOT NULL,     -- 对应 app_users.username (hy2 返回的 id)
    tx_bytes    INTEGER NOT NULL,  -- 上行（服务端→远端）
    rx_bytes    INTEGER NOT NULL,  -- 下行（远端→服务端）
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

-- 查询优化索引
CREATE INDEX idx_traffic_app_user_time ON app_traffic_logs(app_id, user_id, recorded_at);
```

### API 端点

#### 内部端点（hy2 容器回调，不暴露给外部）

**POST /internal/hy2/auth**

Hysteria 2 每次客户端连接时调用。

请求 (来自 hy2):
```json
{
  "addr": "1.2.3.4:12345",
  "auth": "username:password",
  "tx": 50000000
}
```

响应:
```json
// 成功
{"ok": true, "id": "alice"}
// 失败（密码错误、禁用、超配额）
{"ok": false}
```

逻辑：
1. 解析 `auth` 字段，格式 `username:password`
2. 查 `app_users` 表匹配 username + password + enabled=1
3. 如果设了 quota_bytes，查 `app_traffic_logs` 累计是否超额
4. 返回结果

#### 公开 API（前端调用）

**GET /api/apps/:id/users** — 列出用户
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "alice",
      "enabled": true,
      "quota_bytes": 10737418240,
      "used_bytes": 3221225472,
      "online_connections": 2,
      "created_at": "2026-04-01T10:00:00Z"
    }
  ]
}
```

**POST /api/apps/:id/users** — 创建用户
```json
{"username": "alice", "password": "xxx", "quota_bytes": 10737418240}
```
- password 可选，留空自动生成
- quota_bytes 可选，0 = 无限制

**PATCH /api/apps/:id/users/:user_id** — 修改用户
```json
{"enabled": false, "quota_bytes": 0, "password": "new-password"}
```

**DELETE /api/apps/:id/users/:user_id** — 删除用户

**POST /api/apps/:id/users/:user_id/kick** — 踢下线
- 调用 hy2 的 `POST /kick` API

**GET /api/apps/:id/traffic** — 流量统计
```json
{
  "users": [
    {
      "username": "alice",
      "tx_bytes": 1073741824,
      "rx_bytes": 5368709120,
      "online_connections": 2
    }
  ],
  "total": {
    "tx_bytes": 2147483648,
    "rx_bytes": 10737418240
  },
  "period": "24h"  // 支持 query param: ?period=1h|24h|7d|30d|all
}
```

**GET /api/apps/:id/traffic/:username/history** — 单用户流量历史
```json
{
  "points": [
    {"time": "2026-04-01T10:00:00Z", "tx": 104857600, "rx": 524288000},
    {"time": "2026-04-01T11:00:00Z", "tx": 209715200, "rx": 1048576000}
  ],
  "granularity": "1h"  // 根据 period 自动选择: 1h→5min, 24h→1h, 7d→6h, 30d→1d
}
```

**POST /api/apps/:id/traffic/reset** — 清空流量统计
```json
// 请求无 body
// 响应:
{"ok": true, "deleted_local": 142, "deleted_remote": 87}
```
- 硬删除 `app_traffic_logs` 中该 app 的所有行(本地)
- 自动广播到所有运行同模板的远程节点(通过 NodeHub.ProxyRequest),保持与 GET /traffic 聚合视图一致
- 加 `?local=1` 时只重置本地、不向远程传播,用于内部递归终止
- 因为采集器使用 `?clear=1` 写入的是增量(delta),删除现有行后下一轮 poll 自然从零开始,无需触碰内存状态
- 也清空配额计数:`appauth.go` 通过 SUM(`app_traffic_logs`) 检查 `quota_bytes`,被禁用户在重置后立即恢复连接

### 流量采集流程

```
每 60 秒:
  1. GET http://hy2-container:9999/traffic?clear=1
     → {"alice": {"tx": 10485760, "rx": 52428800}, "bob": {"tx": 0, "rx": 0}}
     clear=1 读取后重置计数器，避免重复计算

  2. GET http://hy2-container:9999/online
     → {"alice": 2, "bob": 1}

  3. 对每个 user:
     INSERT INTO app_traffic_logs (app_id, user_id, tx_bytes, rx_bytes) VALUES (...)

  4. 在线状态缓存到内存（不持久化，实时查询即可）
```

### 客户端连接 URI

多用户模式下，URI 格式变为：
```
hysteria2://username:password@{{node.public_ip}}:{{settings.port}}/?insecure=1&sni={{node.domain}}#{{node.hostname}}-username
```

每个用户有独立的连接 URI 和 QR code。

### Settings 扩展

| Key | 类型 | 默认值 | 说明 | Phase |
|-----|------|--------|------|-------|
| `port` | number (1-65535) | `443` | 服务器监听的 UDP 端口 | 现有 |
| `password` | string | `{{generated.password}}` | 单用户模式密码（多用户模式下弃用） | 现有 |
| `masquerade_url` | string (advanced) | `https://news.ycombinator.com/` | 伪装网站 URL | Phase 1 |
| `multi_user` | boolean | `false` | 启用多用户模式（切换 auth type） | Phase 1 |

当 `multi_user=true` 时：
- auth 切换为 `http` 模式
- `password` 设置被忽略
- 开启 `trafficStats`
- 用户通过 API 管理

### 用户故事（新增）

- **US-HY2-4.1: 多用户管理**
  - 作为用户，我想为 Hysteria 2 添加多个用户，每人有独立密码
  - 验收标准: 可以创建/编辑/删除/禁用用户；每用户有独立连接 URI 和 QR code

- **US-HY2-4.2: 流量统计**
  - 作为用户，我想看到每个用户的流量使用情况
  - 验收标准: 显示每用户上下行流量，支持 1h/24h/7d/30d 时间范围；有图表展示

- **US-HY2-4.3: 在线状态**
  - 作为用户，我想知道谁在线、用几个设备
  - 验收标准: 显示每用户在线连接数；支持踢下线

- **US-HY2-4.4: 流量配额**
  - 作为用户，我想给每个用户设置月流量限额
  - 验收标准: 超额后自动拒绝连接；可查看配额使用百分比

### 测试要求（新增）

- **HTTP Auth 端点测试**: 验证 username:password 解析、启用/禁用检查、配额检查、错误格式处理
- **流量采集测试**: Mock hy2 trafficStats API，验证累计写入 SQLite 正确
- **用户 CRUD 测试**: 创建/更新/删除用户，验证 DB 状态
- **踢下线测试**: Mock hy2 /kick API，验证正确调用
- **集成测试**: 完整流程 — 创建用户 → 模拟 auth 请求 → 模拟流量 → 查询统计

---

## Phase 2 规划：ACL + 伪装 + 端口跳跃

> 待 Phase 1 完成后细化

### ACL 规则

hy2 支持强大的 ACL 系统，可按 GeoIP、域名、协议/端口过滤流量：

```yaml
acl:
  inline:
    - reject(geoip:cn)           # 阻断到中国的回连
    - reject(geosite:ads)        # 屏蔽广告域名
    - direct(10.0.0.0/8)         # 内网直连
    - default                    # 其余放行
  geoUpdateInterval: 168h
```

Passim 可提供可视化 ACL 编辑器，生成规则文件。

### 端口跳跃

对抗 ISP 对持久 UDP 连接的限速（仅 Linux）：

```yaml
listen: :20000-50000  # 监听端口范围
```

客户端配置 `hopInterval: 30s`，自动在端口范围内跳跃。需要 `CAP_NET_ADMIN`。

### 伪装配置

允许用户选择伪装模式和目标：
- `proxy` — 反代真实网站（推荐）
- `file` — 服务本地文件
- `string` — 返回固定字符串

### 混淆 (Salamander)

当 QUIC 被封时，salamander 模式让流量不像 QUIC：
```yaml
obfs:
  type: salamander
  salamander:
    password: "shared-secret"
```
代价：失去 HTTP/3 伪装能力。

### 多出口路由 (Outbounds)

hy2 支持通过下游代理转发流量，配合 ACL 实现分流：

```yaml
outbounds:
  - name: us-exit
    type: socks5
    socks5:
      addr: us-proxy.example.com:1080
  - name: jp-exit
    type: socks5
    socks5:
      addr: jp-proxy.example.com:1080

acl:
  inline:
    - us-exit(geosite:netflix)
    - jp-exit(geosite:dmm)
    - direct(all)
```

**注意：这不是多跳 VPN。** 客户端直连 hy2 服务器，服务器根据规则选择不同出口转发。是"一跳 + 分流"，不是 Tor 式的多层加密中继。

## 关于多跳 VPN 的说明

Hysteria 2 **不支持多跳 VPN**。原因：

1. **协议设计**: hy2 是点对点协议（客户端↔服务器），不支持 relay 模式
2. **QUIC 限制**: QUIC 连接绑定到特定端点，无法像 TCP 那样简单转发
3. **outbound ≠ 多跳**: outbound 只是服务端选择出口代理，客户端流量仍然只经过一个 hy2 节点

如果需要多跳，可行的方案是在 hy2 之上叠加：
- hy2 → Xray/V2Ray chain（需要额外配置）
- 多个 hy2 节点串联（客户端→hy2-A→hy2-B，但 hy2 不原生支持，需要在 A 上配置 SOCKS5 outbound 指向 B）
- 这些都不是 hy2 的内建功能，需要额外部署和复杂配置
