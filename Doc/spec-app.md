# 手机 App 详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md)、[stories/epic-10-mobile-app.md](./stories/epic-10-mobile-app.md) 和 [stories/epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md) 使用

---

## 概述

Passim 手机 App 是产品的**主要界面**，不是 Web UI 的缩小版或附属品。

目标用户是普通人——他们管理 VPS 的主要入口是手机，不是电脑。App 提供与 Web UI 完全对等的功能：部署应用、管理容器、查看日志、配置 VPN、管理节点、系统设置——所有操作都能在手机上完成。同时，App 拥有 Web 做不到的原生能力：推送通知、QR 扫码、生物认证、VPN 配置 deep link 导入、App 锁。

Web UI 继续保留（嵌入 Go binary），作为桌面端和初始设置的入口。两端共享核心代码（API client、类型定义、i18n、3D 地球场景），通过 pnpm workspace monorepo 管理。

技术上使用 Expo (React Native) 构建，iOS 和 Android 共用一套代码。所有数据来自 Passim 节点的 HTTP API，App 本身不存储业务数据，只缓存连接信息和偏好设置。

---

## 技术栈

```json
{
  "expo": "~52.0.0",
  "react-native": "0.76.x",
  "react": "^19.0.0",
  "typescript": "^5.7.0",
  "expo-router": "~4.0.0",
  "@tanstack/react-query": "^5.0.0",
  "zustand": "^5.0.0",
  "nativewind": "^4.0.0",
  "@react-three/fiber": "^9.0.0",
  "three": "^0.183.0",
  "expo-gl": "~15.0.0",
  "expo-three": "~8.0.0",
  "expo-secure-store": "~14.0.0",
  "expo-local-authentication": "~15.0.0",
  "expo-camera": "~16.0.0",
  "expo-notifications": "~0.29.0",
  "expo-haptics": "~14.0.0",
  "react-native-reanimated": "~3.16.0",
  "react-native-gesture-handler": "~2.20.0",
  "react-native-sse": "^1.0.0",
  "@simplewebauthn/browser": "^10.0.0",
  "@passim/shared": "workspace:*"
}
```

### 为什么选 Expo 而不是响应式 Web

| 考虑 | Expo App | 响应式 Web |
|------|----------|------------|
| VPN 配置导入 | 系统分享/deep link 直接打开 WireGuard App | 只能下载文件，手动导入 |
| 扫码 | 原生相机，流畅 | 需要权限弹窗，体验差 |
| 推送通知 | 原生推送，后台接收 | Web Push 支持参差不齐 |
| 生物认证 | Face ID / 指纹，原生体验 | WebAuthn 可用但体验不如原生 |
| 离线查看 | SecureStore 缓存配置 | 无 |
| App 锁 | 后台返回时触发认证 | 不可能 |
| 3D 地球 | R3F Native + expo-gl，原生 GPU | WebGL (已有) |

---

## 共享代码架构

App 和 Web 通过 `packages/shared/` 共享核心代码：

```
packages/shared/
├── src/
│   ├── types/               # TypeScript 类型定义 (API 响应、模板、节点等)
│   │   └── index.ts
│   ├── api/                 # 平台无关的 API 方法定义
│   │   └── index.ts
│   ├── i18n/                # 翻译消息
│   │   ├── zh-CN.json
│   │   └── en-US.json
│   └── globe/               # 3D 地球共享场景代码
│       ├── shaders.ts       # GLSL vertex/fragment shaders
│       ├── earth-scene.tsx  # Three.js 场景 (Earth + Clouds + Atmosphere + Stars)
│       ├── markers.tsx      # 节点标记 (本地绿色 + 远程紫色 + 脉冲动画)
│       ├── clustering.ts    # 节点聚类逻辑
│       ├── constants.ts     # 纹理 URL、国家坐标、工具函数
│       ├── billboard.web.tsx    # Web: drei Html overlay
│       └── billboard.native.tsx # Native: RN Animated.View + 3D→2D 投影
├── package.json
└── tsconfig.json
```

### 平台差异处理

React Native 自动根据 `.web.tsx` / `.native.tsx` 后缀选择文件：

| 模块 | Web (现有) | Native (新增) |
|------|-----------|--------------|
| Canvas | `@react-three/fiber` | `@react-three/fiber/native` (expo-gl) |
| Billboard | `drei Html` DOM overlay | `Animated.View` 绝对定位 + `project()` 3D→2D |
| OrbitControls | `drei OrbitControls` (DOM 事件) | `GestureDetector` + `useFrame` 更新相机 |
| Textures | `TextureLoader` URL | 同 URL，expo-three 支持 |
| GLSL Shaders | WebGL | expo-gl WebGL ES (同样 GLSL) |
| SSE | 原生 `EventSource` | `react-native-sse` polyfill |
| Auth Token | `localStorage` | `expo-secure-store` (加密) |
| Base URL | 同源 `/api/*` | `https://{host}/api/*` (多节点直连) |

---

## 目录结构

```
app-mobile/
├── app/                           # Expo Router 页面
│   ├── _layout.tsx                # 根布局 (Providers + 认证守卫)
│   ├── index.tsx                  # 首页 → 有节点跳 Tabs，无节点跳引导
│   ├── (auth)/
│   │   ├── _layout.tsx            # 未认证布局
│   │   ├── welcome.tsx            # 引导页
│   │   ├── add-node.tsx           # 添加节点 (扫码/手动)
│   │   └── scan.tsx               # 扫码页面
│   ├── (tabs)/
│   │   ├── _layout.tsx            # Tab 导航布局 (4 tabs)
│   │   ├── index.tsx              # Dashboard (地球 + 指标 + 概览)
│   │   ├── apps.tsx               # 应用列表 + 商店入口
│   │   ├── nodes.tsx              # 节点列表
│   │   └── settings.tsx           # 设置
│   ├── apps/
│   │   ├── [id].tsx               # 应用详情 (启停/设置/配置/分享/删除)
│   │   ├── [id]/configs.tsx       # VPN 配置列表 (QR/导入/分享/复制)
│   │   └── deploy.tsx             # 部署向导 (模板选择 + 动态表单)
│   ├── nodes/
│   │   ├── add.tsx                # 添加新节点 (扫码/手动)
│   │   ├── [id].tsx               # 节点详情 (容器+应用+指标)
│   │   └── [id]/containers/[cid].tsx  # 容器详情 (日志/终端/操作)
│   ├── containers/
│   │   └── [id].tsx               # 本地容器详情
│   ├── share/
│   │   └── [appId].tsx            # 分享管理
│   └── cloud/                     # 云服务商直连 (Epic 11)
│       ├── accounts.tsx           # 云账号管理
│       ├── add-account.tsx        # 添加云账号
│       ├── provision.tsx          # 购买 VPS 向导
│       ├── progress.tsx           # 创建进度
│       └── storage.tsx            # 开通云存储
├── components/
│   ├── globe/
│   │   ├── GlobeView.tsx          # R3F Native Canvas + 手势控制
│   │   └── NodeOverlay.tsx        # 原生 billboard overlay (Animated.View)
│   ├── NodeCard.tsx               # 节点状态卡片
│   ├── AppCard.tsx                # 应用卡片
│   ├── ContainerCard.tsx          # 容器卡片
│   ├── MetricRing.tsx             # 环形指标图 (CPU/MEM/DISK)
│   ├── StatusDot.tsx              # 状态指示灯
│   ├── QRFullScreen.tsx           # 全屏二维码 (自动调亮度)
│   ├── DynamicForm.tsx            # 动态部署表单 (基于 SettingInfo schema)
│   ├── LogViewer.tsx              # 容器日志查看器 (FlatList 虚拟化)
│   ├── TerminalView.tsx           # 简化终端 (WebView + xterm.js)
│   ├── EmptyState.tsx             # 空状态组件
│   ├── PlanCard.tsx               # VPS 套餐卡片 (Epic 11)
│   ├── RegionPicker.tsx           # 区域选择器 (Epic 11)
│   └── ProvisionProgress.tsx      # 创建进度动画 (Epic 11)
├── lib/
│   ├── api.ts                     # API 客户端 (基于 @passim/shared + SecureStore)
│   ├── storage.ts                 # SecureStore 封装
│   ├── notifications.ts           # 推送注册与处理
│   ├── auth.ts                    # 认证逻辑 (API Key + Passkey + 生物认证)
│   ├── sse.ts                     # SSE 客户端 (react-native-sse)
│   └── cloud/                     # 云厂商适配层 (Epic 11)
│       ├── types.ts
│       ├── registry.ts
│       ├── providers/
│       │   ├── vultr.ts
│       │   ├── digitalocean.ts
│       │   ├── hetzner.ts
│       │   ├── lightsail.ts
│       │   ├── linode.ts
│       │   └── cloudflare.ts
│       ├── cloud-init.ts
│       └── provisioner.ts
├── stores/
│   ├── node-store.ts              # 当前节点/节点列表状态
│   ├── auth-store.ts              # 认证状态
│   ├── cloud-store.ts             # 云账号状态 (Epic 11)
│   └── preferences-store.ts       # 主题/语言/通知偏好
├── hooks/
│   ├── use-node.ts                # 节点数据 Query
│   ├── use-apps.ts                # 应用数据 Query
│   ├── use-containers.ts          # 容器数据 Query
│   ├── use-sse.ts                 # SSE 实时数据 Hook
│   └── use-biometric.ts           # 生物认证 Hook
├── locales/                       # 本地 fallback (主要复用 @passim/shared)
├── app.json                       # Expo 配置
├── eas.json                       # EAS Build 配置
├── tailwind.config.ts             # NativeWind 配置
├── metro.config.js                # Metro bundler (workspace 支持)
├── tsconfig.json
└── package.json
```

---

## 导航结构

```
App 启动
  │
  ├─ 无保存的节点 → (auth) 引导流程
  │   ├── welcome.tsx     # 1-2 屏介绍
  │   │     ├── "已有服务器" → scan.tsx / add-node.tsx
  │   │     └── "没有服务器，帮我买一个" → cloud/provision.tsx (Epic 11)
  │   ├── scan.tsx        # 扫码添加
  │   └── add-node.tsx    # 手动添加
  │
  └─ 有节点 → (tabs) 主界面
      ├── ⌂ 首页 (Dashboard)
      │   ├── 3D 地球 (R3F Native + 节点标记)
      │   ├── 节点状态卡片轮播
      │   ├── CPU/MEM/Disk 实时指标 (环形图)
      │   ├── 网络实时速率
      │   ├── 容器概览 (running/stopped)
      │   └── 应用快捷操作
      │
      ├── 📦 应用
      │   ├── 已部署应用列表 (多节点切换)
      │   ├── 应用详情 → 启停/重启/设置修改/删除
      │   ├── 客户端配置 → QR/导入/分享/下载
      │   ├── 应用商店 → 模板浏览 + 完整部署表单
      │   ├── 批量部署 → 选节点 + 一键部署
      │   └── 连接指南 → 平台安装引导
      │
      ├── 🖥 节点
      │   ├── 节点列表 (在线状态/指标摘要/国旗)
      │   ├── 节点详情 → 容器列表 + 应用列表 + 系统信息
      │   ├── 容器操作 → 启停/重启/删除/日志/终端
      │   ├── 添加节点 (扫码/手动)
      │   ├── 节点间测速 (HTTP + iperf)
      │   ├── 节点版本 + 一键更新
      │   └── SSL 状态 + 续签
      │
      └── ⚙ 设置
          ├── 通用 (节点名称/语言/主题)
          ├── 安全 (Passkey 管理/API Key/App 锁)
          ├── SSL 管理 (状态/续签)
          ├── 系统更新 (版本检查/一键更新)
          ├── 推送通知 (按类型+按节点开关)
          ├── 云账号管理 (Epic 11)
          └── 关于 (版本/开源协议)
```

### Tab 导航

```
┌──────────────────────────────────────────┐
│                                          │
│              页面内容                      │
│                                          │
├──────────┬─────────┬─────────┬───────────┤
│  ⌂ 首页   │ 📦 应用  │ 🖥 节点  │  ⚙ 设置   │
└──────────┴─────────┴─────────┴───────────┘
```

---

## 节点架构：P2P 直连 + 可选 Hub 聚合

### 双层模型

手机 App 采用 **P2P 直连 + 可选 Hub 聚合** 的双层架构：

```
┌─────────────────────────────────────────────────────────┐
│  手机 App                                                │
│                                                         │
│  ┌─── P2P 直连层 ───┐    ┌─── Hub 聚合层 ──────────┐    │
│  │ 直连每个节点       │    │ 通过 Hub 节点获取       │    │
│  │ • 启停容器         │    │ • 聚合订阅 URL          │    │
│  │ • 部署应用         │    │ • 聚合分享链接          │    │
│  │ • 查看指标/日志    │    │ • 聚合存储 (未来)       │    │
│  │ • 管理设置         │    │ • 跨节点配置下载/ZIP    │    │
│  └───────────────────┘    └────────────────────────┘    │
│       │    │    │                    │                    │
│       ▼    ▼    ▼                    ▼                    │
│    节点A 节点B 节点C         节点A (Hub 角色)             │
│    (互不知道对方)            ├→ remote_nodes 表           │
│                              ├→ 知道 B、C               │
│                              └→ 聚合 A+B+C 的 config    │
└─────────────────────────────────────────────────────────┘
```

### P2P 直连 vs Hub 聚合的分工

| 操作 | 走 P2P 直连 | 走 Hub 聚合 |
|------|:-----------:|:-----------:|
| 容器启停/重启/删除 | ✓ | |
| 部署/卸载应用 | ✓ | |
| 查看指标/日志/终端 | ✓ | |
| 节点设置/SSL/更新 | ✓ | |
| 单节点 client config 查看 | ✓ | |
| 聚合订阅 URL (Clash YAML) | | ✓ |
| 聚合分享链接 | | ✓ |
| 跨节点 ZIP 打包下载 | | ✓ |
| 存储聚合 (未来) | | ✓ |

### Hub 节点的选择与管理

**核心概念：** Hub 不是特殊的节点类型，任何节点都可以成为 Hub。用户在某个节点上"注册"其他节点后，该节点自动获得聚合能力。

**node-store 扩展：**

```typescript
interface NodeInfo {
  id: string;
  host: string;
  token: string;
  name: string;
  cloud?: { ... };
  isHub?: boolean;       // 该节点是否已设置为 Hub
}

// store 新增
hubNodeId: string | null;   // 当前选择的 Hub 节点
setHubNode(id: string | null): void;
```

**Hub 节点的设置流程：**

1. 用户在节点详情页或设置页选择某个节点作为 Hub
2. App 调用 Hub 节点的 `POST /api/nodes` 注册其他节点
3. Hub 节点通过 `internal/node/hub.go` 连接到其他节点
4. 聚合功能（订阅/分享/存储）通过 Hub 节点的 API 获取

**无 Hub 时的降级：**

- 所有 P2P 直连功能正常工作
- 订阅/分享/聚合功能不可用，UI 显示引导提示"设置 Hub 节点以启用聚合功能"
- 单节点的 client config 仍可正常查看、复制、导入

### Hub 相关的 UI 设计

**首页 Dashboard：**

```
┌──────────────────────────────┐
│  🌍 地球 + 节点标记            │
│                              │
│  节点概览                     │
│  ┌──────────┐ ┌──────────┐  │
│  │ tokyo-1  │ │ sgp-1    │  │
│  │ 🟢 运行   │ │ 🟢 运行   │  │
│  │ ⭐ Hub   │ │          │  │ ← Hub 节点有标记
│  └──────────┘ └──────────┘  │
└──────────────────────────────┘
```

**节点列表页：**

```
┌──────────────────────────────┐
│  节点                         │
│                              │
│  ┌──────────────────────────┐│
│  │ 🇯🇵 tokyo-1    ⭐ Hub     ││ ← 小标签标记 Hub
│  │ 🟢 在线  v1.2.0          ││
│  └──────────────────────────┘│
│  ┌──────────────────────────┐│
│  │ 🇸🇬 sgp-1                ││
│  │ 🟢 在线  v1.2.0          ││
│  └──────────────────────────┘│
│                              │
│  长按节点 → "设为 Hub"         │
└──────────────────────────────┘
```

**设置页 Hub 区域：**

```
┌──────────────────────────────┐
│  Hub 聚合                     │
│  ┌──────────────────────────┐│
│  │ Hub 节点     tokyo-1  ▸  ││ ← 点击切换
│  │ 已连接节点    3/3 在线    ││
│  │ 聚合订阅      已启用  ▸  ││
│  └──────────────────────────┘│
│                              │
│  未设置 Hub 时:               │
│  ┌──────────────────────────┐│
│  │ 💡 设置 Hub 节点           ││
│  │ 选择一个节点作为聚合中心   ││
│  │ 启用跨节点订阅和分享       ││
│  │         [选择节点]         ││
│  └──────────────────────────┘│
└──────────────────────────────┘
```

---

## 客户端配置 (Client Config) — 完整功能

### 三种配置类型的展示

与 Web 端 (`web/src/features/apps/client-config.tsx`) 功能对等，同时利用原生能力增强。

#### 1. URL 类型 (Hysteria 2 / V2Ray)

```
┌──────────────────────────────┐
│  连接配置                     │
│                              │
│  ┌ Import URI ──────────────┐│
│  │                          ││
│  │  🇯🇵 LOCAL                ││
│  │  Hysteria 2              ││
│  │  ┌────────────────────┐  ││
│  │  │ hysteria2://abc... │  ││ ← 终端风格，可复制
│  │  └────────────────────┘  ││
│  │      [复制] [QR] [导入▾] ││
│  │                          ││
│  │  🇸🇬 sgp-1   (via Hub)   ││ ← Hub 聚合的远程节点
│  │  Hysteria 2              ││
│  │  ┌────────────────────┐  ││
│  │  │ hysteria2://def... │  ││
│  │  └────────────────────┘  ││
│  │      [复制] [QR] [导入▾] ││
│  └──────────────────────────┘│
│                              │
│  ┌ 订阅地址 ────────────────┐│
│  │ 🔗 https://tokyo:8443/.. ││
│  │ 🏷 3 节点                 ││ ← 聚合节点数
│  │      [复制] [QR] [分享]   ││
│  └──────────────────────────┘│
│                              │
│  ┌ 一键导入 ────────────────┐│
│  │ [Stash]  [Shadowrocket]  ││ ← Linking.openURL(import_urls.xxx)
│  └──────────────────────────┘│
└──────────────────────────────┘
```

**"导入▾" 弹出菜单：**
- 复制 URI → Clipboard + Haptics
- 显示 QR → 全屏 QR (自动调亮度)
- 导入到 Stash → `Linking.openURL("stash://install-config?url=...")`
- 导入到 Shadowrocket → `Linking.openURL("sub://...")`
- 系统分享 → `Share.share({ message: uri })`

#### 2. File Per User 类型 (WireGuard)

```
┌──────────────────────────────┐
│  配置文件                     │
│                     [全部下载] │
│                              │
│  ┌──────────────────────────┐│
│  │ 1  peer1.conf             ││
│  │      [导入WG] [QR] [分享] ││
│  ├──────────────────────────┤│
│  │ 2  peer2.conf             ││
│  │      [导入WG] [QR] [分享] ││
│  └──────────────────────────┘│
│                              │
│  Hub 聚合 (via tokyo-1):      │
│  ┌──────────────────────────┐│
│  │ 🇸🇬 sgp-1                 ││
│  │ 1  peer1.conf  [导入] [QR]││
│  └──────────────────────────┘│
└──────────────────────────────┘
```

**"导入WG" 操作：**
1. 通过 API 下载 .conf 文件内容
2. 写入临时文件 (`FileSystem.cacheDirectory`)
3. `Sharing.shareAsync(fileUri)` 或 `Linking.openURL("wireguard://import/...")` 打开 WireGuard app

#### 3. Credentials 类型 (L2TP / RDesktop / WebDAV)

```
┌──────────────────────────────┐
│  连接信息                     │
│                              │
│  ┌──────────────────────────┐│
│  │ 服务器    123.45.67.89 📋 ││
│  │ 用户名    admin        📋 ││
│  │ 密码      ••••••••  👁 📋 ││ ← 点眼睛显示，点复制
│  │ PSK       ••••••••  👁 📋 ││
│  └──────────────────────────┘│
└──────────────────────────────┘
```

### 分享链接管理

```
┌──────────────────────────────┐
│  🔗 分享                      │
│                              │
│  # file_per_user: 每个 peer  │
│  ┌──────────────────────────┐│
│  │ 1 peer1.conf              ││
│  │   https://xx/s/abc.. 📋 🔲││ ← 复制 + QR
│  │                   [撤销]  ││
│  ├──────────────────────────┤│
│  │ 2 peer2.conf              ││
│  │           [创建分享链接]   ││
│  └──────────────────────────┘│
│                              │
│  # url/credentials: 整体分享 │
│  ┌──────────────────────────┐│
│  │ 🟢 链接已启用              ││
│  │ https://xx/s/def...       ││
│  │   [复制] [QR] [分享] [撤销]││
│  └──────────────────────────┘│
└──────────────────────────────┘
```

### 数据流

```
App 打开应用详情
  │
  ├── P2P 直连: GET {activeNode}/api/apps/{id}/client-config
  │   → 当前节点的 config (本地数据，总是可用)
  │
  ├── Hub 聚合 (仅当 hubNodeId 存在):
  │   │
  │   ├── url 类型:
  │   │   GET {hubNode}/api/apps/{id}/client-config
  │   │   → 包含 remote_groups (其他节点的 URI)
  │   │   GET {hubNode}/api/apps/{id}/subscribe
  │   │   → 聚合 Clash YAML (所有节点)
  │   │
  │   ├── file_per_user 类型:
  │   │   GET {hubNode}/api/s/{token}
  │   │   → 包含 remote_groups (其他节点的文件列表)
  │   │   GET {hubNode}/api/s/{token}/zip
  │   │   → 跨节点打包下载
  │   │
  │   └── 分享链接:
  │       POST {hubNode}/api/apps/{id}/share
  │       → token + URL (基于 Hub 节点地址)
  │
  └── 无 Hub 时:
      → 只显示当前节点的 config
      → 分享/订阅区域显示引导: "设置 Hub 节点以启用"
```

---

## 功能清单 (Web 对等 + 原生增强)

### 与 Web UI 对等的功能

| 功能 | Web 实现 | App 实现 |
|------|---------|---------|
| Dashboard 系统指标 | recharts 图表 | MetricRing 环形图 + Reanimated |
| 3D 地球 + 节点标记 | R3F + drei (WebGL) | R3F Native + expo-gl + 手势旋转 |
| 容器列表/详情 | 表格 + 侧边面板 | FlatList + 详情页 |
| 容器启停/重启/删除 | 按钮 + toast | 按钮 + haptic 反馈 + toast |
| 容器日志 | 文本区域 + 实时 tail | LogViewer (FlatList 虚拟化) |
| 容器终端 | xterm.js WebSocket | WebView 内嵌 xterm.js |
| 应用商店 (Marketplace) | 模板卡片网格 + 部署向导 | 模板列表 + 全屏部署向导 |
| 动态部署表单 | DynamicForm (SettingInfo) | DynamicForm RN 版 (同 schema) |
| 应用详情/设置修改 | 侧边面板 + 表单 | 详情页 + 表单 |
| 客户端配置 (VPN) | 文件列表 + QR + 下载 | 文件列表 + QR + deep link 导入 |
| 分享管理 | 创建/撤销 token | 创建/撤销 + 系统分享面板 |
| 多节点管理 | 节点列表 + 详情面板 | 节点列表页 + 详情页 |
| 远程容器/应用管理 | 通过节点详情面板 | 节点详情页内嵌 |
| 批量部署 | 选节点 + 部署 | 同样流程 |
| 节点间测速 | SpeedTest 组件 | 同样 API + 结果展示 |
| SSL 管理 | 状态查看 + 续签按钮 | 同样功能 |
| 系统更新 | 版本检查 + 一键更新 | 同样功能 |
| 设置 (通用/安全/iperf) | 设置页 tabs | 设置页 sections |
| Passkey 管理 | 列表 + 注册/删除 | 同样功能 + 原生生物认证 |
| 连接指南 | 平台卡片 + 步骤 | 同样内容 + app store 链接 |
| SSE 实时数据 | 原生 EventSource | react-native-sse |
| i18n (中/英) | react-i18next | 同样翻译文件 |
| 深色/浅色主题 | next-themes | NativeWind + system preference |

### App 独有的原生增强

| 功能 | 说明 |
|------|------|
| QR 扫码添加节点 | expo-camera 原生相机 |
| VPN 配置 deep link 导入 | `wireguard://import/...`、Stash/Shadowrocket URL scheme |
| 全屏 QR 码 + 自动调亮度 | expo-brightness + expo-screen-orientation |
| 推送通知 | Expo Push Notifications (节点离线/容器停止/SSL到期/更新可用) |
| 生物认证 (Face ID/指纹) | expo-local-authentication |
| App 锁 | 后台 5 分钟超时 → 重新认证 |
| Haptic 反馈 | 操作确认、复制成功 |
| 系统分享面板 | 分享 VPN 配置给朋友 |
| 云端买 VPS | Epic 11 — 直连云厂商 API |

---

## 3D 地球 — R3F Native 实现

### 共享的 Three.js 场景

地球场景是 App 的视觉核心。通过 `packages/shared/globe/` 共享以下代码：

- **GLSL shaders** — 日/夜切换 (smoothstep)、海洋高光 (specular)、大气层辉光 (rim glow)
- **EarthScene** — 地球球体 + 云层 + 大气层 + 星空背景
- **Markers** — 本地节点 (绿色脉冲) + 远程节点 (紫色脉冲) + 遮挡检测
- **Clustering** — 临近节点自动聚类，共享信息卡片
- **Sun direction** — 基于当前时间计算太阳位置，驱动日夜分界线

### Native 适配层

```tsx
// app-mobile/components/globe/GlobeView.tsx
import { Canvas } from '@react-three/fiber/native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { EarthScene } from '@passim/shared/globe/earth-scene';

export function GlobeView({ nodes, status, onMarkerClick }) {
  // 手势控制相机旋转 (替代 drei OrbitControls)
  const rotation = useSharedValue({ x: 0, y: 0 });
  const gesture = Gesture.Pan().onUpdate((e) => {
    rotation.value = {
      x: rotation.value.x + e.changeY * 0.005,
      y: rotation.value.y + e.changeX * 0.005,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <EarthScene
          status={status}
          remoteNodes={nodes}
          rotation={rotation}
          onMarkerClick={onMarkerClick}
        />
      </Canvas>
    </GestureDetector>
  );
}
```

### Billboard (信息卡片) — Native 版

Web 版使用 `drei Html` 在 3D 场景内渲染 DOM。Native 不支持 DOM overlay，改用 3D→2D 投影 + 绝对定位 RN View：

```tsx
// packages/shared/globe/billboard.native.tsx
import { Animated, View, Text } from 'react-native';

// 在 useFrame 中将 3D 标记位置投影到 2D 屏幕坐标
// 通过 Animated.Value 驱动 position absolute 的 top/left
```

---

## 核心流程

### 连接节点

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  引导页      │ ──→ │  扫码/手动    │ ──→ │  验证连接     │
│  Passim 介绍 │     │  输入信息     │     │  成功→Dashboard│
└─────────────┘     └──────────────┘     └──────────────┘

扫码内容 (Web UI 生成):
{
  "host": "vps.example.com:8443",
  "key": "ak_xxxxxxxx"
}

连接验证:
1. POST {host}/api/auth/login { api_key: key }
2. 成功 → 保存到 SecureStore { host, token, name }
3. 失败 → 显示人话错误 ("API Key 不正确" / "连接超时，检查地址")
```

### VPN 配置导入 (核心场景)

```
应用详情 → 配置列表 → 点击 peer1.conf
                         │
                         ├── "导入到 WireGuard"
                         │    → Share.share({ url: conf_file })
                         │    → 或 Linking.openURL("wireguard://import/...")
                         │
                         ├── "显示二维码"
                         │    → 全屏 QR + 自动调高屏幕亮度
                         │    → expo-brightness API
                         │
                         ├── "分享"
                         │    → 系统分享面板
                         │
                         └── "复制内容"
                              → Clipboard + Haptics 反馈
```

### 容器终端 (移动端)

```
容器详情 → "终端" tab
  → WebView 加载内嵌 HTML (xterm.js + fit addon)
  → WebSocket 连接: wss://{host}/api/containers/{id}/terminal
  → 虚拟键盘输入
  → 支持基本命令 (ls, cat, tail, etc.)
  → 横屏模式自动切换
```

### App 锁

```
App 进入后台
  → 记录时间戳

App 回到前台
  → 检查时间差 > 5 分钟?
    ├── 是 → 显示生物认证界面
    │        ├── 成功 → 恢复
    │        └── 失败 → 回到 API Key 输入
    └── 否 → 直接恢复
```

---

## API 交互

App 复用 Passim 的全部 HTTP API (见 [spec-passim.md](./spec-passim.md))，不需要额外的 App 专用端点，除了推送通知注册：

```
POST /api/push/register
  { "token": "ExponentPushToken[xxx]", "device": "iPhone 16", "platform": "ios" }

DELETE /api/push/unregister
  { "token": "ExponentPushToken[xxx]" }

GET /api/push/settings
  → { "node_offline": true, "container_stopped": true, "ssl_expiring": true, ... }

PUT /api/push/settings
  { "node_offline": true, "container_stopped": false, ... }
```

### API 客户端差异 (vs Web)

| 项目 | Web | App |
|------|-----|-----|
| 认证存储 | localStorage | SecureStore (加密) |
| 基础 URL | 同源 `/api/*` | `https://{host}/api/*` (多节点直连) |
| 多节点 | 通过 SSE 代理 | 直连每个节点 API |
| 离线处理 | 无 | TanStack Query 持久化缓存 |
| SSE | 原生 EventSource | react-native-sse polyfill |

```typescript
// app-mobile/lib/api.ts — 基于 @passim/shared 类型
import * as SecureStore from 'expo-secure-store';
import { useNodeStore } from '@/stores/node-store';

export function getClient(nodeId?: string) {
  const store = useNodeStore.getState();
  const node = nodeId ? store.nodes[nodeId] : store.activeNode;
  if (!node) throw new Error('No active node');

  return {
    async request<T>(path: string, options?: RequestInit): Promise<T> {
      const res = await fetch(`https://${node.host}${path}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${node.token}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      if (res.status === 401) {
        throw new AuthError();
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiError(res.status, err.error || 'Unknown error');
      }
      if (res.status === 204) return undefined as T;
      return res.json();
    }
  };
}
```

---

## 本地存储

```typescript
// SecureStore (加密存储，敏感数据)
{
  "nodes": [
    {
      "id": "uuid",
      "host": "vps.example.com:8443",
      "token": "eyJ...",
      "name": "tokyo-1",
      "apiKeyPrefix": "ak_7f3d",
      "cloud": {                       // 云端创建的节点才有此字段
        "provider": "vultr",
        "accountId": "my-vultr",
        "instanceId": "cb676a46-...",
        "region": "nrt",
        "plan": "vc2-1c-1gb",
        "monthlyPrice": 6.00,
        "createdAt": "2026-03-13T..."
      }
    }
  ],
  "activeNodeId": "uuid",
  "biometricEnabled": true,
  "cloudAccounts": [...]              // Epic 11
}

// AsyncStorage (非敏感偏好)
{
  "theme": "system",
  "locale": "zh-CN",
  "pushEnabled": true,
  "lastAppBackgroundTime": 1710000000000
}
```

---

## 推送通知

### 架构

```
Passim 节点检测到事件 (节点离线/容器停止/SSL 到期)
    │
    ▼
查询 push_tokens 表，找到注册的设备
    │
    ▼
POST https://exp.host/--/api/v2/push/send
  {
    "to": "ExponentPushToken[xxx]",
    "title": "tokyo-1 离线",
    "body": "节点已断开连接，上次在线: 5 分钟前",
    "data": { "type": "node_offline", "nodeId": "xxx" }
  }
    │
    ▼
App 收到推送 → 点击 → 根据 data.type 跳转对应页面
```

### 通知类型

| 类型 | 标题示例 | 跳转目标 |
|------|---------|---------|
| `node_offline` | "tokyo-1 离线" | 节点详情 |
| `node_online` | "tokyo-1 恢复在线" | Dashboard |
| `container_stopped` | "WireGuard 异常停止" | 应用详情 |
| `ssl_expiring` | "SSL 证书 3 天后到期" | 节点详情 → SSL |
| `deploy_complete` | "WireGuard 部署完成" | 应用详情 |
| `deploy_failed` | "WireGuard 部署失败" | 应用详情 |
| `update_available` | "Passim v1.1.0 可用" | 设置 → 关于 |

---

## 构建与发布

### EAS Build

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "..." },
      "android": { "serviceAccountKeyPath": "..." }
    }
  }
}
```

### OTA 更新

- 使用 `expo-updates` 推送 JS bundle 更新，无需重新提审
- 原生代码变更 (新增 native module) 才需要提交 App Store / Play Store
- 更新策略: 启动时静默检查，下次启动生效

---

## 性能目标

| 指标 | 目标 |
|------|------|
| 冷启动 (有缓存) | < 1.5s |
| Dashboard 首屏 | < 800ms |
| 地球渲染 FPS | 60 fps |
| 扫码识别 | < 500ms |
| App 包大小 (iOS) | < 35 MB |
| App 包大小 (Android) | < 30 MB |
| 内存占用 | < 120 MB (含 GL 上下文) |
| 后台唤醒 (推送) | < 200ms |
| 云端创建 VPS 全流程 | < 3 分钟 (含 cloud-init) |

---

## 云服务商直连 (Epic 11)

> 详细 User Stories 见 [stories/epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md)

### 架构: App 直连

```
┌─────────────────────────┐
│       Passim App        │
│                         │
│  lib/cloud/             │
│  ┌───────────────────┐  │
│  │  CloudProvider     │  │     HTTPS (直连)
│  │  (统一接口)        │──────────────────┐
│  └───────────────────┘  │                │
│    ▲  ▲  ▲  ▲           │                │
│    │  │  │  │           │                ▼
│  ┌─┴──┴──┴──┴─────────┐│   ┌────────────────────┐
│  │vultr│do│hzn│lightsail││   │  Cloud Provider API │
│  └────────────────────┘│   │  (Vultr/DO/Hetzner/ │
│                         │   │   Lightsail)         │
│  SecureStore            │   └────────────────────┘
│  ┌───────────────────┐  │
│  │ API Keys (加密)    │  │    不经过任何中间服务器
│  └───────────────────┘  │    API Key 只在设备本地
└─────────────────────────┘
```

架构详情、Provider 接口定义、创建流程状态机、cloud-init 与 API Key 回传、AWS 签名、安全设计均沿用原设计，见上方云服务商直连章节原文。
