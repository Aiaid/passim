# Web 前端详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 使用

---

## 概述

前端是用户与 Passim 唯一的交互界面，它的目标是让不懂技术的人也能自如地管理自己的云服务。

设计上追求**干净克制**：不堆功能、不外露技术概念（用户看到的是"部署 VPN"而不是"创建容器"）、视觉上有品位（不用默认蓝，不像后台管理系统）。更接近一个精心设计的消费级产品，而不是 Portainer 那样的开发者工具。

技术上使用 Vite + React 19 + shadcn/ui + Tailwind CSS v4 构建，编译为纯静态文件，通过 Go embed 嵌入 Passim 二进制。所有数据通过同源 `/api/*` 获取，无跨域问题。

---

## 技术栈

```json
{
  "vite": "8.0.0",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "react-router": "7.13.1",
  "typescript": "5.9.3",
  "tailwindcss": "4.2.1",
  "zustand": "5.0.11",
  "@tanstack/react-query": "5.90.21",
  "react-hook-form": "7.71.2",
  "zod": "4.3.6",
  "react-i18next": "^15.0.0",
  "i18next": "^24.0.0",
  "recharts": "3.8.0",
  "sonner": "^2.0.0",
  "lucide-react": "^0.400.0",
  "next-themes": "^0.4.0"
}
```

---

## 目录结构

```
web/src/
├── main.tsx                              # 入口
├── app.tsx                               # 根组件 (路由 + Providers)
├── components/
│   ├── layout/                           # 布局组件
│   │   ├── app-layout.tsx                # 主布局 (Sidebar + Header + Content)
│   │   ├── app-sidebar.tsx               # 侧边栏导航
│   │   ├── auth-guard.tsx                # 认证守卫
│   │   ├── header.tsx                    # 顶栏 (含节点信息: 名称/IP/SSL/容器)
│   │   └── page-header.tsx              # 页面标题组件
│   ├── shared/                           # 共享组件
│   │   ├── confirm-dialog.tsx            # 通用确认弹窗
│   │   ├── empty-state.tsx              # 空状态占位
│   │   ├── loading-skeleton.tsx         # 加载骨架屏 (含 CardGridSkeleton)
│   │   └── status-badge.tsx             # 状态标记 (running/stopped/...)
│   └── ui/                               # shadcn/ui 组件 (24个)
├── features/                             # Feature-based 模块
│   ├── auth/                             # 认证
│   │   ├── login-page.tsx
│   │   ├── login-form.tsx
│   │   └── passkey-login.tsx
│   ├── dashboard/                        # 仪表盘
│   │   ├── dashboard-page.tsx            # 单屏布局 (gauges + chart + sidebar)
│   │   ├── system-metrics.tsx            # SVG 环形仪表盘 (CPU/内存/磁盘/网络)
│   │   ├── metrics-chart.tsx             # CPU & 内存折线图 (固定 X 轴域)
│   │   ├── app-overview.tsx              # 应用概览 (可缩小 + 内部滚动)
│   │   └── queries.ts                    # useStatus, useAppsSummary 等查询
│   ├── containers/                       # 容器管理
│   │   ├── containers-page.tsx
│   │   ├── container-list.tsx            # 卡片网格 (非表格)，状态色左边框
│   │   ├── container-actions.tsx         # 操作菜单 (start/stop/restart/remove)
│   │   ├── container-detail-panel.tsx    # UniFi 风格侧边面板 (Info/Logs tabs)
│   │   └── queries.ts                    # 容器相关查询和 mutations
│   ├── apps/                             # 应用管理
│   │   ├── apps-page.tsx
│   │   ├── app-card.tsx                  # 应用卡片 (点击打开侧边面板)
│   │   ├── app-detail-page.tsx           # 应用详情全页
│   │   ├── app-detail-panel.tsx          # UniFi 风格侧边面板 (Info/Logs tabs)
│   │   ├── app-events.tsx
│   │   └── undeploy-dialog.tsx
│   ├── marketplace/                      # 应用市场
│   │   ├── marketplace-page.tsx
│   │   ├── deploy-wizard-page.tsx
│   │   ├── dynamic-form.tsx
│   │   └── deploy-progress.tsx
│   ├── speedtest/                        # 网络测速
│   │   ├── speed-test.tsx                # 测速 UI (下载/上传/延迟/抖动)
│   │   └── use-speedtest.ts              # 测速逻辑 hook
│   └── settings/                         # 设置
│       ├── settings-page.tsx             # 设置页 (General/Security/SSL tabs)
│       ├── general-settings.tsx          # 通用: 节点名称 + 主题 + 语言
│       ├── security-settings.tsx         # 安全: API Key + Passkeys
│       ├── passkey-list.tsx
│       ├── passkey-register.tsx
│       ├── ssl-settings.tsx
│       └── iperf-settings.tsx            # iperf3 测速服务开关
├── hooks/                                # 自定义 Hooks
│   ├── use-sse.ts                        # SSE 实时数据
│   ├── use-metrics-stream.ts            # 指标流 + 60条缓冲
│   ├── use-mobile.ts                     # 响应式检测
│   └── use-theme.ts                      # 主题切换
├── lib/                                  # 工具库
│   ├── api-client.ts                     # API 客户端 + 类型定义 (ApiError, StatusResponse, etc.)
│   ├── constants.ts                      # 常量 (分类图标映射等)
│   ├── i18n.ts                           # i18next 初始化
│   ├── utils.ts                          # cn(), formatBytes() 等
│   └── webauthn-utils.ts                # base64url ↔ ArrayBuffer
├── stores/                               # Zustand 状态
│   ├── auth-store.ts                     # token + login/logout
│   └── preferences-store.ts             # theme + language + sidebar
└── locales/
    ├── en-US.json
    └── zh-CN.json
```

---

## 路由设计

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<AppLayout />}>            {/* 需要认证 (AuthGuard) */}
    <Route path="/" element={<DashboardPage />} />
    <Route path="/containers" element={<ContainersPage />} />
    <Route path="/apps" element={<AppsPage />} />
    <Route path="/apps/new" element={<MarketplacePage />} />
    <Route path="/apps/new/:template" element={<DeployWizardPage />} />
    <Route path="/apps/:id" element={<AppDetailPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
</Routes>
```

> `/nodes`, `/nodes/:id`, `/storage` 移至 Phase 3+。
> `/apps/new/:template` 为部署向导独立页面。

---

## 页面设计

### 整体布局

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [☰] │ my-vps v0.1.0 · 5d 2h · 1.2.3.4 (JP) / ::ab:cd · SSL auto · 3/5 │ [🌐] [🌙] │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │                                                             │
│  Sidebar   │              Content Area                                   │
│            │                                                             │
│  Dashboard │                                                             │
│  Containers│                                                             │
│  Apps      │                                                             │
│  ── ───── ─│                                                             │
│  Settings  │                                                             │
│            │                                                             │
└────────────┴─────────────────────────────────────────────────────────────┘
```

Header 显示节点信息 (名称/版本/运行时间/公网 IPv4/IPv6+国家/SSL 模式+域名/容器数)。IPv6 截短显示后 4 组，hover 显示完整地址。侧边栏含: Dashboard, Containers, Apps, Settings。远程节点管理 Phase 3 后加入。

### 登录页 `/login`

支持两种登录方式: API Key (主要/首次) + Passkey (便捷/日常)。

```
┌──────────────────────────────────────┐
│                                      │
│           Passim                     │
│                                      │
│   ┌──────────────────────────────┐   │
│   │  API Key                     │   │
│   └──────────────────────────────┘   │
│                                      │
│   [ Sign In                      ]   │
│                                      │
│   ── or ──                           │
│                                      │
│   [ 🔑 Sign in with Passkey     ]   │
│                                      │
│   Run `docker logs passim` to see   │
│   your API key                      │
│                                      │
└──────────────────────────────────────┘
```

- Passkey 按钮仅在已注册过 Passkey 时显示 (通过 `GET /api/auth/passkeys/exists` 检查)
- 首次使用必须用 API Key 登录，然后在设置页注册 Passkey
- Passkey 登录触发浏览器原生 WebAuthn 弹窗 (指纹/面容/安全密钥)

### Dashboard `/`

单屏布局 (`h-[calc(100vh-6.5rem)] overflow-hidden`)，不需要上下滚动。

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                                  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  ╭──╮    │ │  ╭──╮    │ │  ╭──╮    │ │ Network  │       │
│  │  │45│ CPU│ │  │37│ MEM│ │  │40│DISK│ │ ↓5.2 MB  │       │
│  │  ╰──╯    │ │  ╰──╯    │ │  ╰──╯    │ │ ↑2.1 MB  │       │
│  │ 4 cores  │ │ 5.3/8 GB │ │ 40/100GB │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  ┌──────────────────────────┐ ┌──────────────────────────┐  │
│  │ CPU & Memory (5 min)     │ │ Speed Test               │  │
│  │                          │ │  ↓120 Mbps  ↑95 Mbps    │  │
│  │  CPU ──────────────      │ │  ⏱ 12ms     ~ 2ms       │  │
│  │  MEM ──────────────      │ ├──────────────────────────┤  │
│  │                          │ │ Apps                  3  │  │
│  │  -5m  -4m  -3m ... now  │ │  wireguard        🟢     │  │
│  │                          │ │  hysteria2        🟢     │  │
│  └──────────────────────────┘ └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

- Row 1: 标题
- Row 2: SVG 环形仪表盘 (CPU/Memory/Disk 带颜色阈值: >75% 橙色, >90% 红色; Network 独立布局显示收发)
- Row 3: MetricsChart (lg:col-span-3, 固定 X 轴域 [0,59], 绝对时间标签) + 右侧 (lg:col-span-2, SpeedTest + AppOverview, AppOverview 可缩小+内部滚动)

> 远程节点区域将在 Phase 3 加入。

### 容器列表 `/containers`

使用卡片网格而非表格 (sm:2col, lg:3col)。每张卡片左边框有状态颜色 (running=绿, stopped=灰, failed=红, deploying=蓝)。Running 容器显示脉动绿点。点击卡片打开 UniFi 风格的 Sheet 侧边面板。

### 容器/应用侧边面板

点击容器卡片或应用卡片打开右侧 Sheet 面板 (sm:max-w-lg)，包含:
- Header: 名称 + 镜像/模板 + 操作按钮 (start/stop/restart/remove)
- Tabs: Info (状态/镜像/ID/创建时间) | Logs (终端风格, macOS 窗口装饰, 行号, 悬停高亮)
- Log 查看器使用原生 `overflow-y-auto` 而非 Radix ScrollArea (flex 布局兼容性更好)

### 设置页 `/settings`

三个 Tab:
- **General**: 节点名称 (inline 编辑 + 保存)、主题 (Light/Dark/System)、语言 (中文/English)、iperf3 测速服务开关
- **Security**: API Key 状态、Passkey 列表 + 注册/删除
- **SSL**: SSL 模式、域名、证书有效性、到期时间、续期/上传

### 远程节点 — Phase 3

远程节点详情 (`/nodes/:id`) 与本地管理界面结构一致 (指标 + 容器 + 应用)，但数据来源是远程。应用部署时如果有远程节点，显示 "Deploy to" 选择器。

---

## 核心组件

### API 客户端 `lib/api-client.ts`

```tsx
const BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json();
    throw new ApiError(res.status, err.error);  // 简单 err.error 字符串
  }
  return res.json();
}

export const api = {
  // Auth - API Key
  login: (apiKey: string) => request<{token: string}>('/auth/login', { method: 'POST', body: JSON.stringify({ api_key: apiKey }) }),

  // Auth - Passkey (WebAuthn)
  passkeyBegin: () => request<PublicKeyCredentialRequestOptions>('/auth/passkey/begin', { method: 'POST' }),
  passkeyFinish: (credential: any) => request<{token: string}>('/auth/passkey/finish', { method: 'POST', body: JSON.stringify(credential) }),
  getPasskeys: () => request<{passkeys: Passkey[]}>('/auth/passkeys'),
  passkeyRegister: () => request<PublicKeyCredentialCreationOptions>('/auth/passkey/register', { method: 'POST' }),
  passkeyRegisterFinish: (credential: any) => request('/auth/passkey/register/finish', { method: 'POST', body: JSON.stringify(credential) }),
  deletePasskey: (id: string) => request('/auth/passkeys/' + id, { method: 'DELETE' }),

  // API Key management
  getApiKey: () => request<{prefix: string, created_at: string}>('/settings/api-key'),
  regenerateApiKey: () => request<{api_key: string}>('/settings/api-key/regenerate', { method: 'POST' }),

  // Status
  getStatus: () => request<NodeStatus>('/status'),

  // Containers
  getContainers: () => request<{containers: Container[]}>('/containers'),
  startContainer: (name: string) => request('/containers/' + name + '/start', { method: 'POST' }),
  stopContainer: (name: string) => request('/containers/' + name + '/stop', { method: 'POST' }),
  restartContainer: (name: string) => request('/containers/' + name + '/restart', { method: 'POST' }),
  removeContainer: (name: string) => request('/containers/' + name, { method: 'DELETE' }),

  // Apps
  getTemplates: () => request<{templates: Template[]}>('/templates'),
  getApps: () => request<{apps: App[]}>('/apps'),
  deployApp: (template: string, settings: Record<string, any>) => request('/apps', { method: 'POST', body: JSON.stringify({ template, settings }) }),
  removeApp: (id: string) => request('/apps/' + id, { method: 'DELETE' }),
  getAppConfigs: (id: string) => request<{configs: ConfigFile[]}>('/apps/' + id + '/configs'),

  // Remote Nodes
  getNodes: () => request<{nodes: RemoteNode[]}>('/nodes'),
  addNode: (address: string, apiKey: string, name?: string) => request('/nodes', { method: 'POST', body: JSON.stringify({ address, api_key: apiKey, name }) }),
  removeNode: (id: string) => request('/nodes/' + id, { method: 'DELETE' }),
  // 远程代理
  getNodeStatus: (id: string) => request<NodeStatus>('/nodes/' + id + '/status'),
  getNodeContainers: (id: string) => request<{containers: Container[]}>('/nodes/' + id + '/containers'),
  getNodeApps: (id: string) => request<{apps: App[]}>('/nodes/' + id + '/apps'),
  deployNodeApp: (id: string, template: string, settings: Record<string, any>) => request('/nodes/' + id + '/apps', { method: 'POST', body: JSON.stringify({ template, settings }) }),

  // Batch
  batchDeploy: (template: string, settings: Record<string, any>, targets: string[]) => request('/batch/deploy', { method: 'POST', body: JSON.stringify({ template, settings, targets }) }),

  // S3
  getS3: () => request<{credentials: S3Credential[]}>('/s3'),
  addS3: (data: S3Input) => request('/s3', { method: 'POST', body: JSON.stringify(data) }),
  testS3: (id: string) => request('/s3/' + id + '/test', { method: 'POST' }),
};
```

### SSE Hook `hooks/use-sse.ts`

```tsx
export function useSSE<T>(url: string, options?: { enabled?: boolean }) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (options?.enabled === false) return;

    const token = localStorage.getItem('token');
    const source = new EventSource(`${url}?token=${token}`);

    source.onmessage = (e) => setData(JSON.parse(e.data));
    source.onerror = () => {
      source.close();
      // 3s 后重连
      setTimeout(() => { /* 重新创建 EventSource */ }, 3000);
    };

    return () => source.close();
  }, [url, options?.enabled]);

  return data;
}
```

### 动态表单 `components/app/app-form.tsx`

```tsx
function AppForm({ template, defaults, onSubmit }) {
  // 从模板 settings 动态构建 Zod schema
  const schema = useMemo(() => buildZodSchema(template.settings), [template]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <Form {...form}>
      {template.settings.map(setting => (
        <FormField key={setting.key} name={setting.key} render={({ field }) => {
          switch (setting.type) {
            case 'number':
              return setting.max ? <Slider {...field} min={setting.min} max={setting.max} />
                                 : <Input type="number" {...field} />;
            case 'string':   return <Input {...field} />;
            case 'boolean':  return <Switch {...field} />;
            case 'select':   return <Select options={setting.options} {...field} />;
            case 'password': return <Input type="password" {...field} />;
          }
        }} />
      ))}
      <Button type="submit">Deploy</Button>
    </Form>
  );
}
```

---

## 主题

### CSS 变量 (OKLCH)

```css
@import "tailwindcss";

@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0.085 265.76);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-muted: oklch(0.97 0 0);
  --color-border: oklch(0.922 0 0);
  --color-card: oklch(1 0 0);
}

.dark {
  --color-background: oklch(0.145 0 0);
  --color-foreground: oklch(0.985 0 0);
  --color-primary: oklch(0.922 0 0);
  --color-card: oklch(0.205 0 0);
  --color-border: oklch(0.3 0 0);
}
```

### 状态颜色

| 状态 | 颜色 | 用途 |
|------|------|------|
| Running / Connected | 绿 `oklch(0.65 0.2 145)` | 容器运行、节点在线 |
| Stopped | 灰 `oklch(0.65 0 0)` | 容器停止 |
| Failed / Offline | 红 `oklch(0.577 0.245 27)` | 失败、离线 |
| Deploying | 蓝 `oklch(0.65 0.2 250)` | 部署中 |
| Warning | 黄 `oklch(0.75 0.18 80)` | SSL 即将过期 |

---

## 构建与嵌入

```bash
# 前端构建
cd web && pnpm build    # → web/dist/

# Go embed
# internal/api/static.go
//go:embed all:../../web/dist
var staticFiles embed.FS

func serveStatic(r *gin.Engine) {
    // SPA fallback: 所有非 /api 和 /ws 的请求返回 index.html
    r.NoRoute(func(c *gin.Context) {
        if strings.HasPrefix(c.Request.URL.Path, "/api") ||
           strings.HasPrefix(c.Request.URL.Path, "/ws") {
            c.JSON(404, gin.H{"error": "not found"})
            return
        }
        c.FileFromFS("/", http.FS(staticFiles))
    })
}
```

### Dockerfile (多阶段)

```dockerfile
# Stage 1: 前端构建
FROM node:22-alpine AS frontend
RUN corepack enable
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# Stage 2: Go 编译
FROM golang:1.23-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /web/dist ./web/dist
RUN CGO_ENABLED=1 go build -o /passim ./cmd/passim/

# Stage 3: 最终镜像
FROM alpine:3.20
RUN apk add --no-cache ca-certificates iperf3
COPY --from=backend /passim /usr/local/bin/passim
COPY templates/ /etc/passim/templates/

VOLUME /data
EXPOSE 8443 80

ENTRYPOINT ["passim"]
```

---

## 国际化

```json
// locales/zh-CN.json
{
  "nav": {
    "dashboard": "仪表盘",
    "containers": "容器",
    "apps": "应用",
    "nodes": "远程节点",
    "storage": "存储",
    "settings": "设置"
  },
  "dashboard": {
    "local": "本机",
    "remote_nodes": "远程节点",
    "add_node": "添加节点"
  },
  "container": {
    "start": "启动",
    "stop": "停止",
    "restart": "重启",
    "delete": "删除",
    "logs": "日志",
    "system": "系统容器",
    "app": "应用容器"
  },
  "app": {
    "deploy": "部署",
    "deploy_new": "部署新应用",
    "deploy_to": "部署到",
    "select_template": "选择模板",
    "configure": "配置",
    "select_targets": "选择目标节点",
    "local_machine": "本机",
    "deploying": "部署中...",
    "configs": "客户端配置",
    "download": "下载",
    "qr_code": "二维码"
  },
  "node": {
    "add": "添加远程节点",
    "address": "地址",
    "api_key": "API Key",
    "connected": "已连接",
    "disconnected": "未连接",
    "offline": "离线"
  },
  "auth": {
    "sign_in": "登录",
    "sign_in_with_passkey": "使用 Passkey 登录",
    "api_key_placeholder": "输入 API Key",
    "invalid_api_key": "API Key 无效",
    "passkey_failed": "Passkey 验证失败"
  },
  "settings": {
    "security": "安全",
    "passkeys": "Passkeys",
    "passkey_register": "注册新 Passkey",
    "passkey_name": "名称",
    "passkey_last_used": "上次使用",
    "passkey_delete": "删除",
    "passkey_empty": "未注册 Passkey，使用指纹/面容快速登录",
    "api_key": "API Key",
    "api_key_regenerate": "重新生成",
    "api_key_warning": "重新生成会断开所有远程连接"
  }
}
```
