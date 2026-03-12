# Epic 5: 认证

> Phase: 1+2 (P0)

---

## US-5.1 API Key 认证 `P0` `Phase 1+2`

**作为** User
**我想** 用 API Key 登录 Passim Web UI
**以便** 安全访问管理面板

**验收标准:**
- [ ] Passim 首次启动生成 API Key，输出到 Docker 日志
- [ ] 登录页: 输入 API Key → 验证 → 签发 JWT (有效期 7 天)
- [ ] JWT 存储在 localStorage，自动附加到所有请求
- [ ] 7 天到期前可 refresh 续期
- [ ] 支持通过环境变量预设 API Key: `-e PASSIM_AUTH_API_KEY=xxx`
- [ ] API Key 错误时显示 "Invalid API Key"
- [ ] 可在 Settings 页面查看 API Key 前缀 (如 `ak_7f3d...`)
- [ ] 可在 Settings 页面重新生成 API Key (旧 Key 立即失效，断开所有远程连接)
- [ ] API Key 明文仅在生成时显示一次，数据库存储 hash

**前端交互:**
```
Passim

┌──────────────────────────────────────┐
│ API Key: [                         ] │
│                                      │
│ [ Sign In                          ] │
│                                      │
│ ── or ──                             │
│                                      │
│ [ 🔑 Sign in with Passkey         ] │
│                                      │
│ Run `docker logs passim` to see     │
│ your API key                        │
└──────────────────────────────────────┘
```

**技术备注:**
- 不使用密码登录 — API Key 是主要认证方式
- Passkey 按钮仅在已注册过 Passkey 时显示
- 远程节点通信使用 API Key 直接认证 (不走 JWT)
- 未来 Phase 5 可扩展为多用户 (密码 + RBAC)

---

## US-5.2 Passkey 登录 `P0` `Phase 2`

**作为** User
**我想** 用指纹/面容/安全密钥 (Passkey) 快速登录
**以便** 不用每次翻 API Key

**验收标准:**
- [ ] 登录页显示 "Sign in with Passkey" 按钮 (仅已注册 Passkey 时)
- [ ] 点击后触发浏览器原生 WebAuthn 弹窗
- [ ] 验证成功 → 签发 JWT → 跳转 Dashboard
- [ ] 验证失败显示 "Passkey verification failed"
- [ ] 支持多种认证器: Touch ID, Face ID, Windows Hello, YubiKey 等

**前端交互:**
```
[点击 "Sign in with Passkey"]
   ↓
浏览器弹出原生 WebAuthn 对话框:
   "使用 Touch ID 登录 passim"
   [取消]  [使用指纹]
   ↓
验证成功 → 自动跳转 Dashboard
```

**技术备注:**
- 使用 WebAuthn API (`navigator.credentials.get()`)
- 后端使用 `go-webauthn/webauthn` 库
- Passkey 是 API Key 的补充，不是替代 — 首次登录必须用 API Key

---

## US-5.3 Passkey 管理 `P1` `Phase 2`

**作为** User
**我想** 注册和管理我的 Passkeys
**以便** 在多个设备上使用 Passkey 登录

**验收标准:**
- [ ] Settings → Security Tab 显示已注册的 Passkey 列表
- [ ] 每个 Passkey 显示: 名称、创建时间、上次使用时间
- [ ] [Register New Passkey] 按钮触发 WebAuthn 注册流程
- [ ] 注册时可填写名称 (如 "MacBook Touch ID", "YubiKey 5C")
- [ ] 可删除已注册的 Passkey (确认弹窗)
- [ ] 至少保留一种登录方式 — 如果删除最后一个 Passkey，提示 "API Key 仍可登录"

**前端交互:**
```
Settings → Security

Passkeys
┌──────────────────────────────────────────────┐
│ 🔑 MacBook Touch ID                         │
│    Created: 2026-03-01  Last used: 2h ago    │
│                                    [Delete]  │
├──────────────────────────────────────────────┤
│ 🔑 YubiKey 5C                               │
│    Created: 2026-03-05  Last used: 3 days    │
│                                    [Delete]  │
├──────────────────────────────────────────────┤
│                                              │
│         [ + Register New Passkey ]           │
│                                              │
└──────────────────────────────────────────────┘

API Key
┌──────────────────────────────────────────────┐
│ Current: ak_7f3d...e2a1       [Copy] [👁]    │
│ Created: 2026-03-01                          │
│                                              │
│ [ Regenerate Key ]                           │
│ ⚠ This will disconnect all remote nodes     │
└──────────────────────────────────────────────┘
```

**技术备注:**
- 使用 WebAuthn API (`navigator.credentials.create()`)
- Passkey 数据存储在 SQLite `passkeys` 表
- 删除 Passkey 不影响已签发的 JWT

---

## US-5.4 CLI 应急重置 `P1` `Phase 1`

**作为** User
**我想** 在被锁定时通过命令行重置凭证
**以便** 恢复访问

**验收标准:**
- [ ] `docker exec passim passim reset-api-key` — 重置 API Key，输出新 Key
- [ ] `docker exec passim passim reset-passkeys` — 清除所有已注册 Passkey
- [ ] `docker exec passim passim reset-all` — 重置 API Key + 清除 Passkey + 吊销所有 JWT
- [ ] 重置 API Key 后所有入站 WebSocket 连接断开
- [ ] 重置后输出新凭证到 stdout

**技术备注:**
- CLI 子命令直接操作 SQLite，不经过 HTTP API
- auth_version (config 表) 每次重置 +1，用于 JWT 吊销
