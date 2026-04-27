# 邀请链接：B 一键加入 A（Hub）

> 配合 [spec-passim.md](./spec-passim.md) 使用

---

## 概述

现有"添加远程节点"流程要求用户在 A 的 UI 上手填 B 的地址 + B 的 API key。痛点：必须先去 B 拿 key、记住 B 的可达地址、再回到 A 填一遍 —— 来回切换、容易抄错，装机阶段无法做到"一键纳管"。

**目标**：在 A 上点"邀请节点"生成一条带 token 的 install / docker 命令；用户在 B 上跑这条命令，B 启动时自动注册到 A。注册完成后沿用现有 A→B HTTPS+SSE 通信链路，不引入反向通道。

B 把自己的可达地址告诉 A 的方式：复用 Passim 现有的 DNS reflector（`ssl.Manager.GetDomain()` 返回 `<base32-of-pubIP>.dns.passim.io`），不引入新的 IP 探测路径。

---

## 使用流程（用户视角）

1. 在 A 的 Web/Mobile UI 点击 **"邀请节点"** → 弹出对话框，自动调 `POST /api/cluster/invites` 生成一条 token 并展示三种形态命令（Shell / Docker / Mobile）。
2. 用户复制命令，例如：
   ```bash
   curl -fsSL https://raw.githubusercontent.com/aiaid/passim/main/install.sh | \
     INVITE=psk_invite_xxx HUB=https://abc.dns.passim.io:8443 sudo -E bash
   ```
3. 在新机器（B）上执行。`install.sh` 安装 Docker（若需）+ 启动 Passim 容器，并把 `INVITE` / `HUB` 透传给容器。
4. B 启动完成、监听就绪后，自动调用 A 的 `POST /api/cluster/join` 注册自己。最长重试 10 分钟。
5. 几十秒内 A 的节点列表里出现 B —— 用户全程不需要回到 A 填任何东西。

---

## 数据模型

新表 `invite_tokens`（迁移文件 `passim/internal/db/migrations.go`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `token` | TEXT PRIMARY KEY | 形如 `psk_invite_<32-byte-hex>` |
| `note` | TEXT | 用户给这条邀请起的备注（可选） |
| `expires_at` | INTEGER | unix 秒，默认 `now + 86400`（24h） |
| `created_at` | INTEGER | unix 秒 |
| `revoked_at` | INTEGER NULL | 撤销时间，NULL 表示未撤销 |

**可复用语义**：不记 `used_at`。一个 token 在过期前、未撤销前可被多次使用 —— 适合"一条链接装一批 B"。要"一次性"则在 join 成功后由前端调 `DELETE` 撤销。

`remote_nodes` 表不动，复用现有结构。

---

## A 端 API（4 个 endpoint）

路由注册在 `passim/internal/api/router.go`，与 nodeGroup 同级挂 `/api/cluster/*`。

### `POST /api/cluster/invites`（需 API key 认证）

创建一条邀请。

```json
// Request
{
  "note": "tokyo-2",          // 可选
  "ttl_seconds": 86400        // 可选，默认 86400 (24h)，最大 7d
}

// Response 201
{
  "token": "psk_invite_a1b2c3...",
  "note": "tokyo-2",
  "expires_at": 1745798400,
  "created_at": 1745712000,
  "hub_address": "https://abc.dns.passim.io:8443",
  "install_cmd": "curl -fsSL https://raw.githubusercontent.com/aiaid/passim/main/install.sh | INVITE=psk_invite_a1b2c3 HUB=https://abc.dns.passim.io:8443 sudo -E bash",
  "docker_cmd":  "docker run -d --name passim --restart=always -p 8443:8443 -p 80:80 -v passim_data:/data -v /var/run/docker.sock:/var/run/docker.sock -e INVITE=psk_invite_a1b2c3 -e HUB=https://abc.dns.passim.io:8443 ghcr.io/aiaid/passim:latest"
}
```

`hub_address` 由 A 自己 resolve：优先 `SSL_DOMAIN`，否则 `sslMgr.GetDomain()`（reflector 域名）。`cmd/passim/main.go` 已有的 fallback 链抽出 helper 复用。

### `GET /api/cluster/invites`（需 API key 认证）

列出当前未过期且未撤销的邀请。返回数组（与 spec-passim.md 列表 endpoint 风格一致）：

```json
[
  {
    "token": "psk_invite_a1b2c3...",
    "note": "tokyo-2",
    "expires_at": 1745798400,
    "created_at": 1745712000
  }
]
```

### `DELETE /api/cluster/invites/:token`（需 API key 认证）

撤销邀请：把 `revoked_at` 写为当前 unix 秒。撤销后该 token 任何 join 请求返回 401。

```json
{ "status": "revoked" }
```

### `POST /api/cluster/join`（**无 JWT；token 即认证**）

B 调此端点把自己注册到 A。

```json
// Request
{
  "token":   "psk_invite_a1b2c3...",
  "name":    "tokyo-2",                       // 可选，B 的展示名
  "address": "xyz.dns.passim.io:8443",        // 必填，B 的可达地址
  "api_key": "psk_xxx",                       // 必填，B 的 API key
  "version": "v1.2.0"                         // 可选
}
```

处理逻辑：
1. 在 `invite_tokens` 表里查 token：不存在 / 已过期 / 已撤销 → `401 {"error":"invalid invite token"}`
2. 调用现有 `node.Hub.AddNode(address, api_key, name, false)` —— 这一步会触发 A 反向调 B 的 `loginRemote` 验证，确保 A 真的能连回 B：
   - 网络不可达 / TLS 失败 → `502 {"error":"cannot reach node: <detail>"}`
   - 认证失败 → `401 {"error":"node api_key rejected"}`
3. AddNode 已存在同 address → `409 {"id":"...","status":"already_joined"}`
4. 成功 → `201 {"id":"node-uuid","status":"joined"}`

**关键设计**：复用 `Hub.AddNode` 后整个加入流程跟手填一模一样，包括 SSE 订阅、健康检查、远程容器代理等。**不写新的 register 路径。**

---

## B 端环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `INVITE` | — | A 上生成的邀请 token；与 `HUB` 必须同时设置才生效 |
| `HUB` | — | A 的完整 URL，如 `https://abc.dns.passim.io:8443` |
| `NODE_ADDR` | (自动) | 覆盖 B 自己上报的可达地址；缺省走 `sslMgr.GetDomain()` + `:PORT` |
| `NODE_NAME` | (空) | B 的展示名；缺省由 A 端用 `address` 兜底 |

`NODE_ADDR` 自动解析逻辑（在 B 启动后，证书/反射器域名就绪后才执行）：
- 设了 `SSL_DOMAIN` → `https://${SSL_DOMAIN}:${PORT}`
- 否则 → `https://${sslMgr.GetDomain()}:${PORT}`，`PORT` 是 `443` 时省略端口

---

## B 端启动时序

```
docker run ... -e INVITE=... -e HUB=... ghcr.io/aiaid/passim:latest
    │
    ▼
[1] DB 迁移 / setup.Init() — 生成 node_id、api_key（明文 plaintext 暂存内存）
    │
    ▼
[2] SSL 初始化 — letsencrypt 模式下 DNS reflector 域名就绪
    │
    ▼
[3] HTTP(S) ListenAndServe — B 必须先开始监听，A 才能反向验证连通
    │
    ▼
[4] (并行 goroutine) setup.MaybeJoinHub:
    ├─ 读 INVITE / HUB；缺一即跳过
    ├─ 检查 settings 里 hub_joined == HUB → 跳过（idempotent，防重启反复 join）
    ├─ 解析 NODE_ADDR / NODE_NAME / api_key plaintext
    └─ retryJoin: 30s 间隔 × 最多 20 次（共 10 min）
        ├─ 201 / 409 → 写 settings hub_joined=HUB；停止
        ├─ 401 / 410 → token 无效，立即停止；记 warning
        └─ 其他错误 → 等下一周期
```

`setup.Init()` 现在 hash 后存 api_key 不存 plaintext。需要小改：让 join 流程在 setup 里 key 生成那一步直接拿到 plaintext，不进 settings 表（避免明文落盘）。join 成功后 plaintext 在内存里随 goroutine 退出释放。

---

## 失败处理

| 场景 | 行为 |
|---|---|
| `INVITE` 或 `HUB` 缺失 | `MaybeJoinHub` 直接返回，B 正常作为独立节点运行 |
| 已 joined 过同一 HUB（`hub_joined` 标记） | 跳过，不再 join；用户若想重新 join 需手动 `passim reset-all` |
| HTTP 请求超时 / 5xx / 网络错误 | 30s 后重试；最多 20 次后放弃，日志输出 `hub join: gave up after 20 retries` |
| 401（token 无效 / 撤销） | 立即停止重试，日志输出 `hub join: invite token rejected, giving up` |
| 410（token 已过期） | 同 401，立即停止 |
| 502（A 调不回 B） | 继续重试 —— 可能是 B 端口还没开 / SSL 证书还没就绪 |
| `Hub.AddNode` 已存在同 address（409） | 视为成功，写 `hub_joined` 标记 |

A 端：撤销 token 后如果 B 还在重试，B 收到 401 会自行放弃。已注册的 B（在 `remote_nodes` 表里）不受影响。

---

## 安全注意事项

- **Token 格式**：`psk_invite_<32-byte-hex>`，前缀便于审计区分。生成走 `crypto/rand`。
- **一次性 vs 复用**：服务端默认允许复用（无 `used_at`）。如果业务需要"一次性"，前端在 join 成功（A 收到 201）后调 `DELETE /api/cluster/invites/:token` 主动撤销。这是 UI 决策，不在后端 enforce。
- **24h 默认过期**：`ttl_seconds` 默认 86400，最大上限 604800（7 天）。短期窗口降低 token 泄露风险。
- **TLS 全程透传**：`HUB` 必须是 `https://` URL。B 调 `/api/cluster/join` 走 TLS；A 反向调 B 也走 TLS。`install.sh` 透传 `INVITE` / `HUB` 时**必须用 docker `-e VAR` 形式从环境继承**而不是把值嵌进命令字符串，避免 shell 解析过程中 token 被日志/history 记录。
- **token 不打日志**：A 端 `POST /api/cluster/join` 失败的 error log 只记 prefix（前 16 字符）+ remote_addr，不记完整 token。
- **API key 写表**：B 调 join 时把自己的 API key 明文 POST 给 A —— 这是 A→B 反向通信的必需。整条请求走 TLS，A 收到后存进 `remote_nodes`（与现有手填流程一致）。
- **B 不暴露任何"接受邀请"端点**：B 是主动发起方。A 端 `/api/cluster/join` 是唯一新增的无 JWT 端点，token 验证替代 JWT。

---

## 关键复用

- API key 生成：`passim/internal/auth/apikey.go` `GenerateAPIKey()` / `HashAPIKey()`
- 节点验证回流：`passim/internal/node/hub.go` `Hub.AddNode()`
- 公网域名探测：`passim/internal/ssl/domain.go` `DiscoverDomain()` / `Manager.GetDomain()`
- 现有 install.sh：仓库根 `install.sh`，docker run 模板已存在

---

## 不在范围内（明确排除）

- **反向通道 / NAT 穿透**：B 不可达 A 仍然连不上 B；这是另一个独立 feature。
- **批量邀请管理 UI**：只做单条 invite 创建 + 列表 + 撤销。
- **invite 关联权限**：所有 invite 当前等价于 admin 注册（与现有 AddNode 同权限）。
- **B 自动续期 / 重新 join**：B 一次成功就标记完成；如果 A 那边删掉 B，B 不会自动再 join，需要 `passim reset-all` 后用新 invite 重跑。
