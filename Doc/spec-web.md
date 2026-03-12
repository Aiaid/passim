# Web 前端详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 使用

---

## 概述

前端使用 Vite + React 19 + shadcn/ui + Tailwind CSS v4 构建，编译为纯静态文件，通过 Go embed 嵌入 Passim 二进制。所有数据通过同源 `/api/*` 获取，无跨域问题。

---

## 技术栈

```json
{
  "vite": "^6.0.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router": "^7.0.0",
  "typescript": "^5.7.0",
  "tailwindcss": "^4.0.0",
  "zustand": "^5.0.0",
  "@tanstack/react-query": "^5.0.0",
  "react-hook-form": "^7.0.0",
  "zod": "^3.0.0",
  "react-i18next": "^15.0.0",
  "i18next": "^24.0.0",
  "recharts": "^2.15.0",
  "sonner": "^2.0.0",
  "lucide-react": "^0.400.0",
  "qrcode.react": "^4.0.0"
}
```

---

## 目录结构

```
web/
├── src/
│   ├── main.tsx                     # 入口
│   ├── App.tsx                      # 根组件 (路由 + Providers)
│   ├── routes/                      # 页面
│   │   ├── login.tsx                # 登录 (API Key + Passkey)
│   │   ├── dashboard.tsx            # 总览面板
│   │   ├── containers.tsx           # 本地容器管理
│   │   ├── apps/
│   │   │   ├── index.tsx            # 应用列表
│   │   │   ├── new.tsx              # 新建 (模板选择 + 配置向导)
│   │   │   └── [id].tsx             # 应用详情 + 配置导出
│   │   ├── nodes/
│   │   │   ├── index.tsx            # 远程节点列表
│   │   │   └── [id].tsx             # 远程节点详情 (指标/容器/应用)
│   │   ├── storage.tsx              # S3 凭证管理
│   │   └── settings.tsx             # 设置 (节点名/连接管理/Passkey/API Key/主题/语言)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui 组件 (自动生成)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx            # Sonner
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── app-layout.tsx       # 主布局 (Sidebar + Header + Content)
│   │   │   ├── app-sidebar.tsx      # 侧边栏导航
│   │   │   ├── header.tsx           # 顶栏
│   │   │   └── mode-toggle.tsx      # 暗色模式切换
│   │   ├── node/
│   │   │   ├── node-card.tsx        # 节点卡片 (本地 + 远程通用)
│   │   │   ├── node-metrics.tsx     # 实时指标仪表盘
│   │   │   ├── container-list.tsx   # 容器列表 + 操作
│   │   │   ├── container-logs.tsx   # 日志 Sheet
│   │   │   └── add-node-dialog.tsx  # 添加远程节点弹窗
│   │   ├── app/
│   │   │   ├── app-form.tsx         # 动态表单 (根据模板生成)
│   │   │   ├── app-card.tsx         # 应用卡片
│   │   │   ├── deploy-progress.tsx  # 部署进度
│   │   │   ├── config-export.tsx    # 配置导出 + QR Code
│   │   │   └── template-grid.tsx    # 模板选择网格
│   │   └── shared/
│   │       ├── status-badge.tsx     # 状态标记 (running/stopped/...)
│   │       ├── metric-card.tsx      # 指标小卡片 (CPU/MEM/...)
│   │       └── confirm-dialog.tsx   # 通用确认弹窗
│   ├── lib/
│   │   ├── api.ts                   # API 客户端
│   │   ├── utils.ts                 # cn() 等工具
│   │   └── i18n.ts                  # i18next 初始化
│   ├── hooks/
│   │   ├── use-api.ts               # TanStack Query wrappers
│   │   ├── use-sse.ts               # SSE 实时数据
│   │   ├── use-auth.ts              # 认证状态 (API Key + Passkey)
│   │   ├── use-passkey.ts           # WebAuthn 注册/认证流程
│   │   └── use-theme.ts             # 主题切换
│   ├── stores/
│   │   └── app-store.ts             # Zustand (sidebar/viewMode)
│   ├── types/
│   │   ├── api.ts                   # API 响应类型
│   │   ├── node.ts
│   │   ├── app.ts
│   │   └── container.ts
│   └── locales/
│       ├── en-US.json
│       └── zh-CN.json
├── index.html
├── vite.config.ts
├── components.json                  # shadcn/ui 配置
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 路由设计

```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<AppLayout />}>            {/* 需要认证 */}
    <Route path="/" element={<Dashboard />} />
    <Route path="/containers" element={<Containers />} />
    <Route path="/apps" element={<Apps />} />
    <Route path="/apps/new" element={<NewApp />} />
    <Route path="/apps/:id" element={<AppDetail />} />
    <Route path="/nodes" element={<Nodes />} />
    <Route path="/nodes/:id" element={<NodeDetail />} />
    <Route path="/storage" element={<Storage />} />
    <Route path="/settings" element={<Settings />} />
  </Route>
</Routes>
```

---

## 页面设计

### 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│ Header                              [🌙] [🌐 EN] [Settings] │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  Sidebar   │              Content Area                       │
│            │                                                 │
│  Dashboard │                                                 │
│  Containers│                                                 │
│  Apps      │                                                 │
│  ── Remote─│                                                 │
│  Nodes     │                                                 │
│  ── ───── ─│                                                 │
│  Storage   │                                                 │
│  Settings  │                                                 │
│            │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

侧边栏分两块: 上半部分是本地管理 (Dashboard/Containers/Apps)，分隔线后是远程管理 (Nodes)，底部是 Storage/Settings。

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

```
┌─────────────────────────────────────────────────────────────┐
│  Local                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ CPU      │ │ Memory   │ │ Disk     │ │ Network  │       │
│  │ 45.2%    │ │ 5.3/8 GB │ │ 40/100GB │ │ ↓5 ↑2 MB │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  ┌─────────────────────────┐ ┌────────────────────────────┐ │
│  │ Containers        5/6  │ │ Apps                    3  │ │
│  │ wireguard     🟢  2%   │ │ 🛡️ Wireguard     🟢 Run   │ │
│  │ l2tp          🟢  1%   │ │ 🔒 L2TP          🟢 Run   │ │
│  │ webdav        🔴  -    │ │ 📁 WebDAV        🔴 Stop  │ │
│  │ speedtest     🟢  1%   │ │                            │ │
│  │ swag          🟢  0%   │ │ [Deploy New App]           │ │
│  │ [View All]              │ │                            │ │
│  └─────────────────────────┘ └────────────────────────────┘ │
│                                                             │
│  Remote Nodes                              [+ Add Node]    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ tokyo-2     │ │ us-west     │ │ frankfurt   │           │
│  │ 🟢 Connected│ │ 🟢 Connected│ │ 🔴 Offline  │           │
│  │ CPU ██░░ 15%│ │ CPU █░░░ 8% │ │ Last seen:  │           │
│  │ MEM ███░ 45%│ │ MEM ██░░ 30%│ │ 2h ago      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Dashboard 清晰分为: 本地状态 (上) + 远程节点 (下)。没有远程节点时不显示下半部分。

### 远程节点详情 `/nodes/:id`

与本地管理界面结构一致 (指标 + 容器 + 应用)，但数据来源是远程。顶部有 Badge 提示 "Remote Node"。

### 其他页面

容器、应用、存储、设置页面的设计与之前的 [spec-web.md (v2)](./rewrite-plan.md) 保持一致，参见之前版本中的 ASCII 线框图。区别仅在于:

- 不再有 "独立模式 vs 网关模式" 的区分 — 所有页面统一
- 应用部署时，如果有远程节点，显示 "Deploy to" 选择器 (本机 + 远程节点列表)
- 批量部署跨节点时使用 `POST /api/batch/deploy`

---

## 核心组件

### API 客户端 `lib/api.ts`

```tsx
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json();
    throw new ApiError(err.error.code, err.error.message);
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
RUN apk add --no-cache ca-certificates
COPY --from=backend /passim /usr/local/bin/passim
COPY templates/ /etc/passim/templates/

VOLUME /data
EXPOSE 8443

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
