# Epic 5: 认证

> Phase: 1+2 (P0)

Passim 的认证设计为两层：API Key 是"主钥匙"（首次登录、应急恢复、节点间通信），Passkey 是"日常钥匙"（指纹/面容快捷登录）。对普通用户来说，注册 Passkey 之后基本不需要再碰 API Key。

**设计原则：**
- 登录页简洁，不给用户选择焦虑——有 Passkey 就一键登录，没有就输入 API Key
- 所有技术术语配说明（API Key → "登录钥匙"，Passkey → "指纹/面容登录"）
- 错误信息用普通人能懂的语言
- 安全操作（重置 Key、删除 Passkey）有清晰的后果说明

---

## US-5.1 API Key 认证 `P0` `Phase 1+2`

**作为** 用户
**我想** 用 API Key 登录 Passim
**以便** 安全访问管理面板

API Key 是 Passim 的主认证方式——像一把万能钥匙。首次启动时自动生成，之后用户可以注册 Passkey 代替日常使用。

**验收标准:**

**API Key 生成:**
- [ ] Passim 首次启动自动生成 API Key，输出到 Docker 日志
- [ ] API Key 格式: `ak_` 前缀 + 随机字符串
- [ ] 明文仅在生成时显示一次，数据库存储 hash
- [ ] 支持通过环境变量预设: `-e PASSIM_AUTH_API_KEY=xxx`

**登录页:**
- [ ] 页面顶部: "Passim" Logo + 欢迎语
- [ ] API Key 输入框，placeholder: "输入你的 API Key"
- [ ] 输入框下方提示: "首次使用？在终端运行 `docker logs passim` 查看"
- [ ] [登录] 按钮
- [ ] 已注册过 Passkey 时，在 API Key 输入框上方显示: [🔑 指纹/面容登录] 按钮（更醒目，作为主要登录方式）
- [ ] 未注册 Passkey 时，不显示 Passkey 按钮

**登录流程:**
- [ ] 验证成功 → 签发 JWT (有效期 7 天) → 跳转 Dashboard
- [ ] JWT 存储在 httpOnly cookie，自动附加到所有请求
- [ ] 7 天到期前可 refresh 续期
- [ ] 验证失败:
  - Key 格式不对: "请检查 API Key 格式，应以 ak_ 开头"
  - Key 错误: "API Key 不正确，请确认后重试"
  - 连续 5 次失败: "错误次数过多，请等待 1 分钟后重试"

**Settings 中的 API Key 管理:**
- [ ] Settings → 安全 页面显示 API Key 前缀 (如 `ak_7f3d...`)
- [ ] [显示完整 Key] 按钮（需要再次验证身份）
- [ ] [复制] 按钮
- [ ] [重新生成] 按钮，确认弹窗:
  - "重新生成后，旧的 API Key 立即失效"
  - "所有远程节点连接将断开，需要用新 Key 重新连接"
  - [取消] [重新生成]
- [ ] 重新生成后全屏显示新 Key（和首次设置向导 US-1.2 一样的样式）

**前端交互:**
```
--- 有 Passkey 时的登录页 ---
┌──────────────────────────────────────┐
│                                      │
│              Passim                  │
│                                      │
│  [ 🔑 指纹 / 面容登录            ]  │
│                                      │
│  ─── 或用 API Key 登录 ───          │
│                                      │
│  API Key: [                       ]  │
│  首次使用？终端运行 docker logs      │
│  passim 查看                         │
│                                      │
│  [ 登录                           ]  │
│                                      │
└──────────────────────────────────────┘

--- 没有 Passkey 时的登录页 ---
┌──────────────────────────────────────┐
│                                      │
│              Passim                  │
│                                      │
│  API Key: [                       ]  │
│  首次使用？终端运行 docker logs      │
│  passim 查看                         │
│                                      │
│  [ 登录                           ]  │
│                                      │
└──────────────────────────────────────┘
```

**技术备注:**
- 不使用密码登录 — API Key 是主要认证方式
- 远程节点通信使用 API Key 直接认证 (不走 JWT)
- 未来 Phase 5 可扩展为多用户 (密码 + RBAC)

---

## US-5.2 Passkey 登录 `P0` `Phase 2`

**作为** 用户
**我想** 用指纹或面容快速登录
**以便** 不用每次翻 API Key

Passkey 是日常登录方式——注册一次，之后打开 Passim 就像解锁手机一样简单。

**验收标准:**
- [ ] 登录页 [🔑 指纹/面容登录] 按钮（仅已注册 Passkey 时显示）
- [ ] 点击后触发浏览器原生 WebAuthn 弹窗
- [ ] 验证成功 → 签发 JWT → 跳转 Dashboard
- [ ] 验证失败: "验证未通过，请重试或使用 API Key 登录"
- [ ] 用户取消验证: 不显示错误，回到登录页
- [ ] 支持多种认证器: Touch ID, Face ID, Windows Hello, YubiKey 等

**前端交互:**
```
[点击 "指纹/面容登录"]
  ↓
浏览器弹出原生 WebAuthn 对话框:
  "使用 Touch ID 登录 passim"
  [取消]  [使用指纹]
  ↓
验证成功 → 自动跳转 Dashboard

--- 验证失败 ---
Toast: "验证未通过，请重试或使用 API Key 登录"
```

**技术备注:**
- 使用 WebAuthn API (`navigator.credentials.get()`)
- 后端使用 `go-webauthn/webauthn` 库
- Passkey 是 API Key 的补充，不是替代 — 首次登录必须用 API Key

---

## US-5.3 Passkey 管理 `P1` `Phase 2`

**作为** 用户
**我想** 管理我注册的指纹/面容/安全密钥
**以便** 在多个设备上使用快捷登录

**验收标准:**

**Passkey 列表:**
- [ ] Settings → 安全 页面显示已注册的 Passkey 列表
- [ ] 每个 Passkey 显示:
  - 图标 (根据类型: 🖐 指纹 / 😊 面容 / 🔑 安全密钥)
  - 名称（如 "MacBook 指纹"、"YubiKey"）
  - 注册时间
  - 上次使用: "2 小时前" / "3 天前" / "从未使用"
- [ ] 没有 Passkey 时显示引导:
  - "注册指纹或面容，下次打开直接登录"
  - [注册 Passkey]

**注册新 Passkey:**
- [ ] [+ 注册新的 Passkey] 按钮
- [ ] 点击后先输入名称（placeholder: "如 MacBook 指纹、手机面容"）
- [ ] 确认后触发 WebAuthn 注册流程
- [ ] 注册成功: Toast "已注册「MacBook 指纹」"
- [ ] 注册失败: "注册未完成，请重试" (不显示技术错误)

**删除 Passkey:**
- [ ] 每个 Passkey 行有 [删除] 操作
- [ ] 确认弹窗: "删除「MacBook 指纹」？删除后无法用它登录"
- [ ] 删除最后一个 Passkey 时额外提示: "删除后只能用 API Key 登录"

**前端交互:**
```
Settings → 安全

指纹 / 面容 / 安全密钥
注册后打开 Passim 直接登录，不用输入 API Key

┌──────────────────────────────────────────────────┐
│ 🖐 MacBook 指纹                                  │
│    注册于 2026-03-01 · 上次使用: 2 小时前        │
│                                         [删除]   │
├──────────────────────────────────────────────────┤
│ 🔑 YubiKey 5C                                    │
│    注册于 2026-03-05 · 上次使用: 3 天前          │
│                                         [删除]   │
├──────────────────────────────────────────────────┤
│                                                  │
│           [ + 注册新的 Passkey ]                 │
│                                                  │
└──────────────────────────────────────────────────┘

API Key
┌──────────────────────────────────────────────────┐
│ 当前 Key: ak_7f3d...e2a1       [复制] [显示]    │
│ 生成于 2026-03-01                                │
│                                                  │
│ [ 重新生成 ]                                     │
│ 重新生成后旧 Key 立即失效，远程连接将断开       │
└──────────────────────────────────────────────────┘
```

**技术备注:**
- 使用 WebAuthn API (`navigator.credentials.create()`)
- Passkey 数据存储在 SQLite `passkeys` 表
- 删除 Passkey 不影响已签发的 JWT

---

## US-5.4 CLI 应急重置 `P1` `Phase 1`

**作为** 被锁在外面的用户
**我想** 通过命令行重置登录凭证
**以便** 恢复访问，不用重装 Passim

这是最后的救命手段——当 API Key 丢了、Passkey 设备也不在身边时，回到终端重置。

**验收标准:**
- [ ] `docker exec passim passim reset-api-key` — 重置 API Key，输出新 Key 到终端
- [ ] `docker exec passim passim reset-passkeys` — 清除所有已注册的 Passkey
- [ ] `docker exec passim passim reset-all` — 重置 API Key + 清除 Passkey + 吊销所有 JWT
- [ ] 每个命令执行前输出将要执行的操作，要求输入 `yes` 确认:
  ```
  ⚠ 这将重置 API Key，旧 Key 立即失效，所有远程连接将断开。
  输入 yes 确认:
  ```
- [ ] 重置 API Key 后所有入站 WebSocket 连接断开
- [ ] 重置后输出新凭证到 stdout，格式清晰:
  ```
  ✅ API Key 已重置
  新的 API Key: ak_xxxxxxxxxxxxxxxx
  请保存好这个 Key
  ```

**技术备注:**
- CLI 子命令直接操作 SQLite，不经过 HTTP API
- auth_version (config 表) 每次重置 +1，用于 JWT 吊销
