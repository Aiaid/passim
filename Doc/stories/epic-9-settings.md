# Epic 9: 设置与个性化

> Phase: 2 (P1) + Phase 5 (P3)

---

## US-9.1 暗色模式 `P1` `Phase 2`

**作为** 用户
**我想** 切换亮色/暗色主题
**以便** 在不同光线环境下舒适使用

**验收标准:**
- [ ] Header 右上角主题切换按钮 (3 种模式):
  - Light
  - Dark
  - System (跟随操作系统)
- [ ] 切换动画平滑 (CSS transition)
- [ ] 偏好保存到 localStorage，下次访问自动应用
- [ ] 所有页面和组件适配暗色模式 (shadcn/ui 原生支持)
- [ ] 图表和状态颜色在暗色模式下保持可读性

**技术实现:**
- shadcn/ui 通过 CSS 变量 + `class="dark"` 实现
- `next-themes` 管理主题切换
- OKLCH 色彩空间确保亮暗模式颜色感知一致

**前端交互:**
```
Header 右上角:
  [Dark ▼]
    ├── Light
    ├── Dark
    └── System
```

---

## US-9.2 安全设置 `P1` `Phase 2`

**作为** 用户
**我想** 在设置页管理 Passkey 和 API Key
**以便** 控制认证方式和节点访问

**验收标准:**

**Passkey 管理:**
- [ ] 显示已注册 Passkey 列表 (名称、创建时间、上次使用)
- [ ] 注册新 Passkey (触发 WebAuthn 流程)
- [ ] 删除 Passkey (确认弹窗)
- [ ] 详见 US-5.3

**API Key 管理:**
- [ ] 显示当前 API Key 前缀 (如 `ak_7f3d...e2a1`)
- [ ] 复制完整 Key / 切换显示
- [ ] 重新生成 API Key:
  - 确认弹窗，警告 "所有远程连接将断开"
  - 生成后显示新 Key (仅一次)
  - 旧 Key 立即失效
  - 所有入站 WebSocket 断开

**前端交互:**
```
Settings → Security

Passkeys
┌──────────────────────────────────────────────┐
│ 🔑 MacBook Touch ID       Last used: 2h ago │
│ 🔑 YubiKey 5C             Last used: 3 days │
│                                              │
│         [ + Register New Passkey ]           │
└──────────────────────────────────────────────┘

API Key
┌──────────────────────────────────────────────┐
│ ak_7f3d...e2a1              [Copy] [Reveal]  │
│ Created: 2026-03-01                          │
│                                              │
│ [ Regenerate ]                               │
│ ⚠ Will disconnect all remote nodes          │
└──────────────────────────────────────────────┘
```
