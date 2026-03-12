# Epic 3: 应用部署

> Phase: 1 (P0) + Phase 2 (P1) + Phase 3 (P2)

---

## US-3.1 浏览应用模板 `P0` `Phase 1`

**作为** 用户
**我想** 看到所有可部署的应用类型
**以便** 选择需要的服务

**验收标准:**
- [ ] 模板按分类展示:
  - VPN: Wireguard / L2TP / V2ray / Hysteria
  - 存储: WebDAV / Samba
  - 远程桌面: RDesktop
- [ ] 每个模板显示: 图标、名称、描述、分类标签 (Badge)
- [ ] 支持搜索模板 (按名称/分类)
- [ ] 点击模板进入配置向导 (→ US-3.2)

**数据来源:**
- 独立模式: `GET /templates`
- 网关模式: `GET /api/v1/app-templates`

**前端交互:**
```
Deploy New Application

VPN
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 🛡️ Wire- │ │ 🔒 L2TP  │ │ ⚡ V2ray │ │ 🚀 Hyst- │
│ guard    │ │ /IPSec   │ │          │ │ eria     │
│ P2P VPN  │ │ Classic  │ │ Proxy    │ │ Fast     │
│          │ │ VPN      │ │          │ │ Proxy    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

Storage                     Remote Desktop
┌──────────┐ ┌──────────┐  ┌──────────┐
│ 📁 WebDAV│ │ 📂 Samba │  │ 🖥️ RDesk │
│ File     │ │ Windows  │  │ Remote   │
│ Sharing  │ │ Share    │  │ Desktop  │
└──────────┘ └──────────┘  └──────────┘
```

---

## US-3.2 部署应用 `P0` `Phase 1`

**作为** 用户
**我想** 选择一个应用模板并配置后部署到 VPS
**以便** 使用该服务

**验收标准:**
- [ ] 向导步骤: 选模板 → 填参数 → 选节点 (Gateway) → 确认部署
- [ ] 参数表单根据模板 YAML 的 `settings` 动态生成
- [ ] 参数验证 (类型/范围/必填) 使用动态构建的 Zod schema
- [ ] Solo 模式: 直接部署到当前节点 (跳过节点选择步骤)
- [ ] Gateway 模式: 可选择部署到单个或多个节点
- [ ] 部署提交后显示实时进度:
  1. 镜像拉取 (显示百分比)
  2. 容器创建
  3. 容器启动
  4. 健康检查通过
- [ ] 部署成功后自动跳转到应用详情页
- [ ] 部署失败显示错误原因和重试按钮

**进度展示:**
```
Deploying Wireguard to tokyo-1...

  ✅ Pulling image           100%
  ✅ Creating container
  ⏳ Starting container       ← 当前步骤
  ○  Health check

  [Cancel]
```

**动态表单字段类型映射:**

| 模板 type | UI 组件 | 说明 |
|----------|---------|------|
| `number` | Input (type=number) 或 Slider | 有 min/max 时用 Slider |
| `string` | Input | |
| `text` | Textarea | 多行文本 |
| `boolean` | Switch | |
| `select` | Select | options 来自模板 |
| `password` | Input (type=password) + 显示/隐藏 | |

---

## US-3.3 批量部署 (Gateway) `P1` `Phase 2`

**作为** Power User
**我想** 把同一个应用部署到多台 VPS
**以便** 快速扩展服务

**验收标准:**
- [ ] 应用详情页 "部署到更多节点" 按钮
- [ ] 弹窗列出所有在线节点 (已部署的灰色标记)
- [ ] 可勾选多个节点，也可 "全选在线节点"
- [ ] 显示每个节点的部署进度 (并行执行)
- [ ] 部分失败不影响其他节点
- [ ] 失败的节点可单独重试

**前端交互:**
```
Dialog: 部署 Wireguard 到更多节点

  ☑ 全选在线节点

  ☑ tokyo-1      🟢 Online    (尚未部署)
  ☑ us-west-1    🟢 Online    (尚未部署)
  ☐ frankfurt-1  🔴 Offline   (不可选)
  ── 已部署 ──
  ☐ singapore-1  🟢 Online    ✅ Running

  [Cancel]  [Deploy to 2 nodes]

  --- 部署中 ---

  tokyo-1:    ████████░░ 80%  Starting...
  us-west-1:  ██████░░░░ 60%  Pulling image...
```

---

## US-3.4 查看应用详情和部署状态 `P2` `Phase 3`

**作为** 用户
**我想** 查看应用的配置和各节点上的部署状态
**以便** 了解服务运行情况

**验收标准:**
- [ ] 显示应用配置参数 (可编辑 → US-3.7)
- [ ] 显示部署到的每个节点:
  - 节点名、IP
  - 状态 (🟢 running / 🔴 failed / 🟡 deploying / ⚪ stopped)
  - 部署时间
- [ ] 可从该页面直接操作: 重新部署 / 卸载 / 查看日志
- [ ] 失败的部署显示错误原因和重试按钮

---

## US-3.5 导出客户端配置 `P0` `Phase 1`

**作为** 用户
**我想** 下载 VPN/应用的客户端配置文件
**以便** 在我的设备上连接

**验收标准:**

| 应用 | 导出方式 |
|------|---------|
| Wireguard | 下载 `.conf` 文件 + 二维码弹窗 (QR Code) |
| L2TP | 显示连接参数表格 (服务器/用户名/密码/PSK) + 导出 iOS `.mobileconfig` |
| Hysteria | 下载 `passim.yaml` / `stash.yaml` |
| WebDAV | 显示连接地址 + 用户名/密码 |
| RDesktop | 显示 RDP 连接地址 + 端口 |

- [ ] 每个配置文件旁显示 [Download] 和 [QR Code] 按钮
- [ ] QR Code 在 Dialog 中全屏展示，方便手机扫码
- [ ] 每种应用下方显示对应的图文教程 (howto，来自模板定义)
- [ ] Gateway 模式: 先选择节点，再显示该节点的配置

**前端交互:**
```
Client Configs

Node: [tokyo-1 ▼]

📄 peer1.conf    [Download]  [QR Code]
📄 peer2.conf    [Download]  [QR Code]
📄 peer3.conf    [Download]  [QR Code]

── How to Connect ──
1. 下载 WireGuard 客户端
   iOS: App Store  |  Android: Play Store  |  Windows: wireguard.com
2. 导入配置文件或扫描二维码
3. 开启连接
```

---

## US-3.6 卸载应用 `P2` `Phase 3`

**作为** 用户
**我想** 从节点上卸载不再需要的应用
**以便** 释放资源

**验收标准:**
- [ ] 单节点卸载: 应用详情页，点击节点旁的 "卸载" 按钮
- [ ] 完全删除: 应用详情页 "删除应用" → 从所有节点卸载 + 删除应用记录
- [ ] 卸载清理: 停止容器 → 删除容器 → 清理配置文件和挂载卷
- [ ] 卸载前确认对话框
- [ ] 卸载过程显示进度

**前端交互:**
```
# 单节点卸载
节点行 ⋮ → "卸载" → AlertDialog: "从 tokyo-1 卸载 Wireguard?" [取消] [卸载]

# 完全删除
页面右上角 [Delete] → AlertDialog:
  "删除应用 Wireguard?"
  "将从 2 个节点上卸载并删除所有配置"
  [取消] [删除] (destructive)
```

---

## US-3.7 更新应用配置 `P2` `Phase 3`

**作为** 用户
**我想** 修改已部署应用的配置参数
**以便** 调整服务行为 (如增加 Wireguard peers)

**验收标准:**
- [ ] 应用详情页点击 [Edit] 进入编辑模式
- [ ] 使用与部署时相同的动态表单 (预填当前值)
- [ ] 修改后提示 "配置已更新，需重新部署才能生效"
- [ ] [Apply Changes] 按钮 → 自动重新部署到所有关联节点
- [ ] 重新部署使用滚动更新: 先部署新容器，成功后删除旧容器
- [ ] 进度展示复用 US-3.2 的部署进度 UI
