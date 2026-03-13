# 手机 App 详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md)、[stories/epic-10-mobile-app.md](./stories/epic-10-mobile-app.md) 和 [stories/epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md) 使用

---

## 概述

Passim 手机 App 不是 Web UI 的缩小版，而是围绕"随手管理"场景重新设计的移动端。

核心场景只有几个：扫码连接节点、看一眼状态、启停应用、获取 VPN 配置导入客户端、给朋友分享。大部分时候用户不会主动打开 App，而是收到推送通知后进来看一眼。

新增场景: **云服务商直连**——没有 VPS 的用户可以在 App 里直接购买 VPS 并自动部署 Passim。App 直连云厂商 REST API (Vultr / DigitalOcean / Hetzner / AWS Lightsail / Linode)，用户的 API Key 只存储在手机本地，不经过任何中间服务。Cloudflare R2 作为纯存储选项 (免出站费)。详见 [stories/epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md)。

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
│   ├── share/
│   │   └── [appId].tsx            # 分享给朋友
│   └── cloud/                     # 云服务商直连 (Epic 11)
│       ├── accounts.tsx           # 云账号管理
│       ├── add-account.tsx        # 添加云账号
│       ├── provision.tsx          # 购买 VPS 向导 (选区域→选配置→确认)
│       ├── progress.tsx           # 创建进度 (全屏)
│       └── storage.tsx            # 开通云存储
├── components/
│   ├── NodeCard.tsx               # 节点状态卡片
│   ├── AppCard.tsx                # 应用卡片
│   ├── MetricRing.tsx             # 环形指标图 (CPU/MEM/DISK)
│   ├── StatusDot.tsx              # 状态指示灯
│   ├── QRFullScreen.tsx           # 全屏二维码 (自动调亮度)
│   ├── EmptyState.tsx             # 空状态组件
│   ├── PlanCard.tsx               # VPS 套餐卡片 (价格/配置)
│   ├── RegionPicker.tsx           # 区域选择器 (按大洲分组+延迟)
│   └── ProvisionProgress.tsx      # 创建进度动画
├── lib/
│   ├── api.ts                     # API 客户端 (复用 Web 的 API 结构)
│   ├── storage.ts                 # SecureStore 封装 (节点列表/token/偏好)
│   ├── notifications.ts           # 推送注册与处理
│   ├── auth.ts                    # 认证逻辑 (API Key + Passkey + 生物认证)
│   └── cloud/                     # 云厂商适配层 (能力模型)
│       ├── types.ts               # Capability 接口定义
│       ├── registry.ts            # Provider 注册表 + 能力发现
│       ├── providers/
│       │   ├── vultr.ts           # compute + storage
│       │   ├── digitalocean.ts    # compute + storage
│       │   ├── hetzner.ts         # compute + storage
│       │   ├── lightsail.ts       # compute + storage (SigV4)
│       │   ├── linode.ts          # compute + storage
│       │   └── cloudflare.ts      # storage + tunnel + dns
│       ├── cloud-init.ts          # cloud-init 脚本生成
│       └── provisioner.ts         # 统一创建+轮询+连接流程
├── stores/
│   ├── node-store.ts              # 当前节点/节点列表状态
│   ├── cloud-store.ts             # 云账号状态
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
  │   │     ├── "已有服务器" → scan.tsx / add-node.tsx
  │   │     └── "没有服务器，帮我买一个" → cloud/provision.tsx (Epic 11)
  │   ├── scan.tsx        # 扫码添加
  │   └── add-node.tsx    # 手动添加
  │
  └─ 有节点 → (tabs) 主界面
      ├── Dashboard       # 节点状态 + 应用列表
      ├── 应用             # 所有应用 + 部署入口
      └── 设置             # 节点管理/主题/通知/云账号/关于
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
      "apiKeyPrefix": "ak_7f3d",
      // 云端创建的节点才有此字段
      "cloud": {
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

  // 云厂商账号 (Epic 11)
  "cloudAccounts": [
    {
      "id": "my-vultr",
      "provider": "vultr",
      "name": "my-vultr",
      "apiKey": "encrypted...",      // Vultr API Key
      "email": "me@email.com",
      "addedAt": "2026-03-13T..."
    },
    {
      "id": "do-main",
      "provider": "digitalocean",
      "name": "do-main",
      "apiKey": "encrypted...",      // DO Bearer Token
      "email": "me@email.com",
      "addedAt": "2026-03-13T..."
    }
  ]
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

### Provider Adapter 接口

```typescript
// lib/cloud/types.ts — 能力 (Capability) 模型
// 详细类型定义见 epic-11-cloud-provisioning.md

type ProviderId = 'vultr' | 'digitalocean' | 'hetzner' | 'lightsail' | 'linode' | 'cloudflare';
type Capability = 'compute' | 'storage' | 'tunnel' | 'dns';

interface CloudProvider {
  id: ProviderId;
  name: string;
  icon: string;
  website: string;
  capabilities: Capability[];         // 声明支持的能力

  validateCredentials(creds: ProviderCredentials): Promise<AccountInfo>;

  // 按能力挂载具体实现
  compute?:  ComputeCapability;       // VPS 管理
  storage?:  StorageCapability;       // S3 兼容存储
  tunnel?:   TunnelCapability;        // Cloudflare Tunnel
  dns?:      DnsCapability;           // DNS 管理
}

interface ProviderCredentials {
  apiKey?: string;                   // Vultr / DO / Hetzner / Linode / Cloudflare
  accessKeyId?: string;              // AWS
  secretAccessKey?: string;          // AWS
  region?: string;                   // Lightsail
  accountId?: string;                // Cloudflare
}

interface AccountInfo {
  email?: string;
  name?: string;
  balance?: number;          // 可用余额 (USD)
  valid: boolean;
  error?: string;
}

interface Region {
  id: string;
  name: string;              // "Tokyo", "Frankfurt"
  country: string;           // "JP", "DE"
  continent: 'asia' | 'americas' | 'europe' | 'oceania';
  available: boolean;
}

interface Plan {
  id: string;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  bandwidthTb: number;
  monthlyPrice: number;      // USD
  hourlyPrice?: number;
  recommended: boolean;      // 1C/1G 或 1C/2G，最便宜够用的
}

interface Instance {
  id: string;
  ip?: string;
  ipv6?: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  region: string;
  plan: string;
  createdAt: string;
  tags?: Record<string, string>;
}

interface CreateInstanceOpts {
  region: string;
  plan: string;
  hostname?: string;         // 默认 "passim-{random}"
  userData: string;          // cloud-init YAML
  tags?: Record<string, string>;
}

interface StorageCredentials {
  endpoint: string;          // s3.amazonaws.com / sgp1.vultrobjects.com
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}
```

### 各厂商 API 映射

> 完整对照表见 [epic-11-cloud-provisioning.md](./stories/epic-11-cloud-provisioning.md)

| 维度 | Vultr | DigitalOcean | Hetzner | Lightsail | Linode |
|------|-------|-------------|---------|-----------|--------|
| **Base URL** | `api.vultr.com/v2` | `api.digitalocean.com/v2` | `api.hetzner.cloud/v1` | `lightsail.{region}.amazonaws.com` | `api.linode.com/v4` |
| **认证** | `Bearer {key}` | `Bearer {token}` | `Bearer {token}` | AWS Signature V4 | `Bearer {PAT}` |
| **HTTP 风格** | RESTful | RESTful | RESTful | 全部 POST | RESTful |
| **创建实例** | `POST /instances` | `POST /droplets` | `POST /servers` | `→ CreateInstances` | `POST /linode/instances` |
| **user_data** | Base64 | 明文 | 明文 | 明文 | Base64 (`metadata.user_data`) |
| **实例 ID** | UUID | Int | Int | Name | Int |
| **标签** | string[] | string[] | kv map | kv[] | string[] |

**仅存储: Cloudflare R2** — `{account_id}.r2.cloudflarestorage.com`，Bearer Token 认证，免出站费

### 创建流程状态机

```typescript
// lib/cloud/provisioner.ts

type ProvisionState =
  | { step: 'creating';     message: '正在创建服务器...' }
  | { step: 'booting';      message: '等待服务器启动...' }
  | { step: 'installing';   message: '正在安装 Passim...' }
  | { step: 'connecting';   message: '正在验证连接...' }
  | { step: 'done';         message: '搞定了！';          nodeId: string }
  | { step: 'error';        message: string;              retryable: boolean };

async function provisionNode(
  provider: CloudProvider,
  opts: { region: string; plan: string },
  onProgress: (state: ProvisionState) => void,
): Promise<string> {
  // 1. 创建实例
  onProgress({ step: 'creating', message: '正在创建服务器...' });
  const cloudInit = generateCloudInit();  // 包含随机 API Key
  const { instanceId } = await provider.createInstance({
    region: opts.region,
    plan: opts.plan,
    userData: cloudInit.script,
    tags: { 'passim': 'pending' },
  });

  // 2. 等待实例运行
  onProgress({ step: 'booting', message: '等待服务器启动...' });
  const instance = await pollUntil(
    () => provider.getInstance(instanceId),
    (i) => i.status === 'running' && !!i.ip,
    { interval: 5000, timeout: 120_000 },
  );

  // 3. 等待 Passim 就绪
  onProgress({ step: 'installing', message: '正在安装 Passim...' });
  await pollUntil(
    () => fetch(`https://${instance.ip}:8443/api/status`, {
      // 自签证书，忽略 TLS 错误
    }).then(r => r.ok).catch(() => false),
    (ok) => ok === true,
    { interval: 10_000, timeout: 300_000 },
  );

  // 4. 读取 API Key 并连接
  onProgress({ step: 'connecting', message: '正在验证连接...' });
  const updatedInstance = await provider.getInstance(instanceId);
  const apiKey = updatedInstance.tags?.['passim-api-key'];
  // 或使用 cloud-init 写入的 tag

  const { token } = await fetch(`https://${instance.ip}:8443/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  }).then(r => r.json());

  // 5. 保存节点
  const nodeId = await saveNode({
    host: `${instance.ip}:8443`,
    token,
    name: `${provider.name}-${instance.region}`,
    cloud: {
      provider: provider.id,
      instanceId,
      region: opts.region,
      plan: opts.plan,
      ip: instance.ip!,
      monthlyPrice: /* from plan */,
    },
  });

  onProgress({ step: 'done', message: '搞定了！', nodeId });
  return nodeId;
}
```

### cloud-init 与 API Key 回传

不依赖各厂商 tag/label 差异，使用 Passim 自身的 `setup_token` 机制:

```yaml
# lib/cloud/cloud-init.ts → generateCloudInit()

#cloud-config
package_update: true
packages:
  - docker.io
  - curl
runcmd:
  - systemctl enable docker
  - systemctl start docker
  - |
    PASSIM_API_KEY=$(openssl rand -hex 24)
    docker run -d \
      --name passim \
      --restart always \
      -e PASSIM_API_KEY="$PASSIM_API_KEY" \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v passim-data:/data \
      -p 8443:8443 \
      -p 80:80 \
      passim/passim:latest
```

**回传流程:**
1. Passim 首次启动检测到 `PASSIM_API_KEY` 环境变量 → 生成一次性 `setup_token`
2. `GET /api/status` (无需认证) 返回 `{ "setup": true, "setup_token": "xxx" }`
3. App 轮询此端点 → 收到 token → `POST /api/auth/setup { setup_token }` → JWT
4. setup_token 使用一次后失效，60 分钟过期

### AWS Lightsail 签名

Lightsail 使用 AWS Signature V4，不能像其他三家一样只传 Bearer Token:

```typescript
// lib/cloud/lightsail.ts
// 使用 @smithy/signature-v4 (~15KB gzipped) + @aws-crypto/sha256-js
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const signer = new SignatureV4({
  service: 'lightsail',
  region,
  credentials: { accessKeyId, secretAccessKey },
  sha256: Sha256,
});
```

### 安全设计

| 威胁 | 对策 |
|------|------|
| API Key 泄露 | SecureStore 加密存储 + App 锁 (生物认证) |
| 中间人攻击 | HTTPS 直连云 API (TLS pinning 可选) |
| API Key 权限过大 | 引导用户创建最小权限 API Key (只需 compute/storage) |
| 意外扣费 | 创建前显示价格确认，套餐选择器显示月费 |
| 孤儿实例 (创建后 App 崩溃) | 本地持久化 instanceId，重启后可恢复/清理 |
| cloud-init 中的 API Key | 随机生成，一次性使用，连接后建议注册 Passkey |
| Tunnel token 泄露 | 与 API Key 同等保护，存 SecureStore；cloudflared 容器内不暴露 |
