# 手机 App 详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 和 [stories/epic-10-mobile-app.md](./stories/epic-10-mobile-app.md) 使用

---

## 概述

Passim 手机 App 不是 Web UI 的缩小版，而是围绕"随手管理"场景重新设计的移动端。

核心场景只有几个：扫码连接节点、看一眼状态、启停应用、获取 VPN 配置导入客户端、给朋友分享。大部分时候用户不会主动打开 App，而是收到推送通知后进来看一眼。

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
  "expo-secure-store": "~14.0.0",
  "expo-local-authentication": "~15.0.0",
  "expo-camera": "~16.0.0",
  "expo-notifications": "~0.29.0",
  "expo-haptics": "~14.0.0",
  "react-native-reanimated": "~3.16.0",
  "react-native-gesture-handler": "~2.20.0",
  "nativewind": "^4.0.0",
  "@simplewebauthn/browser": "^10.0.0"
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

---

## 目录结构

```
app-mobile/
├── app/                           # Expo Router 页面
│   ├── _layout.tsx                # 根布局 (Providers + 认证守卫)
│   ├── index.tsx                  # 首页 → 有节点跳 Dashboard，无节点跳添加
│   ├── (auth)/
│   │   ├── _layout.tsx            # 未认证布局
│   │   ├── welcome.tsx            # 引导页
│   │   ├── add-node.tsx           # 添加节点 (扫码/手动)
│   │   └── scan.tsx               # 扫码页面
│   ├── (tabs)/
│   │   ├── _layout.tsx            # Tab 导航布局
│   │   ├── index.tsx              # Dashboard (节点状态概览)
│   │   ├── apps.tsx               # 应用列表
│   │   └── settings.tsx           # 设置
│   ├── apps/
│   │   ├── [id].tsx               # 应用详情 (启停/配置)
│   │   └── configs/[id].tsx       # VPN 配置详情 (导入/二维码/分享)
│   ├── nodes/
│   │   ├── add.tsx                # 添加新节点
│   │   └── [id].tsx               # 节点详情
│   └── share/
│       └── [appId].tsx            # 分享给朋友
├── components/
│   ├── NodeCard.tsx               # 节点状态卡片
│   ├── AppCard.tsx                # 应用卡片
│   ├── MetricRing.tsx             # 环形指标图 (CPU/MEM/DISK)
│   ├── StatusDot.tsx              # 状态指示灯
│   ├── QRFullScreen.tsx           # 全屏二维码 (自动调亮度)
│   └── EmptyState.tsx             # 空状态组件
├── lib/
│   ├── api.ts                     # API 客户端 (复用 Web 的 API 结构)
│   ├── storage.ts                 # SecureStore 封装 (节点列表/token/偏好)
│   ├── notifications.ts           # 推送注册与处理
│   └── auth.ts                    # 认证逻辑 (API Key + Passkey + 生物认证)
├── stores/
│   ├── node-store.ts              # 当前节点/节点列表状态
│   └── preferences-store.ts       # 主题/语言/通知偏好
├── hooks/
│   ├── use-node.ts                # 节点数据 Query
│   ├── use-apps.ts                # 应用数据 Query
│   └── use-biometric.ts           # 生物认证 Hook
├── locales/
│   ├── zh-CN.json
│   └── en-US.json
├── app.json                       # Expo 配置
├── eas.json                       # EAS Build 配置
└── package.json
```

---

## 导航结构

```
App 启动
  │
  ├─ 无保存的节点 → (auth) 引导流程
  │   ├── welcome.tsx     # 1-2 屏介绍
  │   ├── scan.tsx        # 扫码添加
  │   └── add-node.tsx    # 手动添加
  │
  └─ 有节点 → (tabs) 主界面
      ├── Dashboard       # 节点状态 + 应用列表
      ├── 应用             # 所有应用 + 部署入口
      └── 设置             # 节点管理/主题/通知/关于
```

### Tab 导航

```
┌────────────────────────────────────────┐
│                                        │
│            页面内容                      │
│                                        │
├────────┬────────────┬──────────────────┤
│ ⌂ 首页  │  📱 应用   │    ⚙ 设置       │
└────────┴────────────┴──────────────────┘
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
| 认证存储 | httpOnly cookie | SecureStore (加密) |
| 基础 URL | 同源 `/api/*` | `https://{host}/api/*` (可能多节点) |
| 多节点 | 通过 WebSocket 代理 | 直连每个节点 API |
| 离线处理 | 无 | TanStack Query 持久化缓存 |

```typescript
// lib/api.ts
import * as SecureStore from 'expo-secure-store';

const getClient = (nodeId: string) => {
  const node = nodeStore.getState().nodes[nodeId];
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
        // token 过期，尝试重新登录
        throw new AuthError();
      }
      return res.json();
    }
  };
};
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
      "apiKeyPrefix": "ak_7f3d"
    }
  ],
  "activeNodeId": "uuid",
  "biometricEnabled": true
}

// AsyncStorage (非敏感偏好)
{
  "theme": "system",         // light / dark / system
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
| `ssl_expiring` | "SSL 证书 3 天后到期" | 节点详情 → 安全连接 |
| `deploy_complete` | "WireGuard 部署完成" | 应用详情 |
| `deploy_failed` | "WireGuard 部署失败" | 应用详情 |
| `update_available` | "Passim v1.1.0 可用" | 设置 → 关于 |

---

## 构建与发布

### EAS Build

```json
// eas.json
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
| 扫码识别 | < 500ms |
| App 包大小 (iOS) | < 30 MB |
| App 包大小 (Android) | < 25 MB |
| 内存占用 | < 100 MB |
| 后台唤醒 (推送) | < 200ms |
