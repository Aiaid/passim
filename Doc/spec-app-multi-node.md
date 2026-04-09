# 多节点应用管理设计

> 配合 [spec-app.md](./spec-app.md)、[spec-web.md](./spec-web.md) 使用

---

## 背景

Passim 支持本地 node 和远程 node 的多节点架构。每个 node 有独立的 SQLite，应用记录（`apps` 表）是 node 本地的 —— 远程 node 上的应用通过 `/api/nodes/:id/apps` 代理获取。

当前（改造前）的实现存在以下问题：

1. **路由用 app UUID 导致跨 node 失效**
   `web/src/app.tsx` 路由是 `/apps/:id`，`useApp(id)` 走 `/api/apps/{id}` 只查本地 DB。如果列表页聚合时把"primary"选到了远程 node 的应用，点击详情直接 404。

2. **聚合卡片把多 node 同 template 合并成一个 primary，丢信息**
   `apps-page.tsx` 按 `app.template` 分组，每组取"第一个遇到的"作为 primary 展示。用户看不到其他 node 上的同类型实例，也无法从卡片进入它们。

3. **远程有、本地没有的 template 无法部署**
   `deployAppHandler` 强制本地模板存在（`app.go:62`），用户在远程 node 发现一个陌生应用时，无法在本地或其他 node 部署同类型实例。

4. **用户心智模型和实现不匹配**
   普通用户的心智是"我有一个 WireGuard"，而不是"我有一个 UUID 是 xxx 的应用"。现在的 UUID 路由违背了这个模型。

---

## 设计目标

- **URL 稳定且有语义**：用 template name 作为标识，不用 UUID
- **多 node 同 template 不丢信息**：每个 node 上的实例都能被查看和操作
- **未部署的 node 主动引导**：在详情页里直接能 deploy 到没装的 node
- **单 node 场景无感**：只有本地的情况下，交互体验不比现在差

---

## 核心决策

### 1. URL 用 template name

| 当前 | 改后 |
|------|------|
| `/apps/abc-123-uuid` | `/apps/wireguard` |
| `/apps/abc-123-uuid` (远程的) | `/apps/wireguard/node-b-id` |
| `/apps/new` | `/apps/new` （保持，部署向导） |

- `/apps/:template` —— 默认选中第一个实例（优先本地，其次按 node 顺序），或如果没有任何实例则显示空态
- `/apps/:template/:nodeId` —— 深链接到某个具体 node 上的实例（`nodeId` 为字面量 `local` 或远程 node 的 UUID）

**为什么用 template name 而不是 `/nodes/:nodeId/apps/:appId`**：
- template name 是稳定常量，不会变
- URL 更短、更语义化
- 匹配"同一个逻辑应用在多 node 上"的心智

**约束条件**（沿用后端现状）：
- 单 node 单 template 唯一 —— `GetActiveAppByTemplate` 检查保留，不改
- 不强制全局唯一 —— 家里/公司各装一个 wireguard 是合理场景

### 2. 双 URL 单页布局

`/apps/:template` 和 `/apps/:template/:nodeId` 渲染**同一个组件**，只是初始选中的 instance 不同。

页面结构：

```
┌───────────────────────────────────────┐
│ ← Apps                                │
│                                       │
│ 🔒 WireGuard                          │
│   Secure VPN tunnel · 2/3 deployed    │  ← 页头
├───────────────────────────────────────┤
│                                       │
│ ── Instance ──                        │  ← Rich Switcher
│ ╔═══════════════════════════════════╗ │
│ ║ 🇺🇸 Local    ● Running  [On 🔄]  ║ │  ← 选中态（背景高亮）
│ ║   Port 51820 · 3 users · 12 GB    ║ │
│ ╚═══════════════════════════════════╝ │
│ ┌───────────────────────────────────┐ │
│ │ 🇯🇵 Node-B   ● Running  [On]     │ │
│ │   Port 51820 · 1 user · 2 GB      │ │
│ └───────────────────────────────────┘ │
│ ┌───────────────────────────────────┐ │  ← dim (未部署)
│ │ 🇩🇪 Node-C       —       [Off]   │ │
│ │   Not deployed                    │ │
│ └───────────────────────────────────┘ │
│                                       │
├───────────────────────────────────────┤
│ [Stop]  [Restart]  [Config]  [Delete]│  ← 选中实例操作
├───────────────────────────────────────┤
│ Overview │ Users │ Metrics │ Logs    │  ← 外层 tabs
├───────────────────────────────────────┤
│                                       │
│  (当前 tab 内容 — 跟随选中 instance) │
│                                       │
└───────────────────────────────────────┘
```

**"双层"的含义**：两个 URL 模式渲染同一组件 + 视觉上 switcher 层和 tabs 层分离。**不是两个页面**。

**"Users / Metrics / Logs 放外面"的含义**：它们在页面最外层 tabs（与 switcher 同页，不嵌套在 switcher 里）。

### 3. Rich Instance Switcher

参考 `_legacy/Web/components/deployment_vps_card.tsx` 的视觉模式，在 shadcn/tailwind 技术栈下复刻。

**每一行（一个 node）包含**：

| 元素 | 数据 | 来源 |
|------|------|------|
| 国旗 emoji | `node.country` | `countryFlag()` helper，已在 `multi-node-panel.tsx:17-21` |
| Node name | `node.name` | `status.node.name` (local) / `RemoteNode.name` |
| 状态点 | running / stopped / connecting / not-deployed | `StatusDot` 组件（复用 `multi-node-panel.tsx` 的动画 ping 效果） |
| 小字指标 | `Port {port} · {users} users · {traffic}` | 从 app 详情 API 取（端口/用户/流量） |
| Deploy Switch | on/off + loading | shadcn `<Switch loading>` （需扩展） |

**选中态视觉**：
- 选中的行：`bg-primary/5 ring-1 ring-primary/40`
- 未选中：`hover:bg-foreground/[0.02]`
- 未部署：`opacity-60`（行本身依然可选中）

**交互**：

| 点击区域 | 行为 |
|---------|------|
| 行本体（flag / name / metrics 区域） | 选中 → URL 变 `/apps/:template/:nodeId` → tabs 内容刷新 |
| 右侧 Switch | `stopPropagation()` —— 不影响选中态。toggle 触发 deploy/undeploy |
| 未部署行的选中 | Tabs 显示 "Not deployed" empty state，包含 [Deploy] CTA |

### 4. Deploy / Undeploy Toggle

**Switch 组件**：扩展 `web/src/components/ui/switch.tsx`，新增可选 `loading?: boolean` prop。

```tsx
// ui/switch.tsx 新 API
<Switch
  checked={isDeployed}
  loading={isPending}  // 新增
  onCheckedChange={handleToggle}
/>
```

实现：
- `loading=true` 时，`disabled={true}` + 在 Switch 上层叠加 `<Loader2 className="animate-spin">` 居中图标
- `loading=false` 时，behave 如原生 shadcn Switch
- 向后兼容 —— 现有 `<Switch>` 调用点不受影响

**部署流程**：

```
Switch off → on
  ├─ 本地：POST /api/apps { template, settings }
  └─ 远程：POST /api/nodes/:nodeId/apps { template, settings }
```

`settings` 来自 template 的默认值（同当前部署向导行为）。

**卸载流程**：

```
Switch on → off
  ├─ 弹 AlertDialog: "Undeploy {templateName} from {nodeName}?"
  ├─ 用户取消 → Switch 保持 on，不调用 API
  └─ 用户确认 → DELETE /api/apps/:appId (或远程代理) → Switch 进入 loading → 成功后变 off
```

**确认对话框**：必须有。误触 undeploy 代价大（数据可能丢失，配置要重新填）。legacy AntD 版本没确认，新版必须加。

### 5. "Not deployed" 行的 tab 内容

当用户选中一个未部署的 node，tabs 区域显示统一 empty state：

```
┌───────────────────────────────────────┐
│                                       │
│         🔒  Not deployed on            │
│             Node-C                    │
│                                       │
│  WireGuard is not running on this     │
│  node yet. Toggle the switch above    │
│  or click below to deploy.            │
│                                       │
│         [ Deploy here ]               │
│                                       │
└───────────────────────────────────────┘
```

Overview / Users / Metrics / Logs 四个 tabs 都显示这个统一 empty state（不区分 tab）。

### 6. 离线 node 的处理

| node.status | Switcher 行表现 | Switch 表现 | 选中后 tab |
|-------------|----------------|-------------|-----------|
| `connected` + 已部署 | 正常 | enable | 正常内容 |
| `connected` + 未部署 | dim | enable (off) | empty state (deploy CTA) |
| `connecting` | dim + 标签 "Connecting..." | disabled | empty state (wait) |
| `disconnected` | dim + 标签 "Offline" | disabled | empty state (offline) |

---

## 前端实现

### 数据获取（前端聚合）

当前 `multi-node-panel.tsx:183-212` 已经有类似的聚合模式。我们复用思路：

```ts
// app-detail-page.tsx (伪代码)
const { template } = useParams();  // "wireguard"
const { nodeId } = useParams();    // "local" or node uuid
const { apps: localApps, nodes, status } = useEventStream();
const connectedNodes = (nodes ?? []).filter(n => n.status === 'connected');

// 拉所有远程 node 的应用列表
const nodeAppQueries = useQueries({
  queries: connectedNodes.map(node => ({
    queryKey: ['nodes', node.id, 'apps'],
    queryFn: () => api.getNodeApps(node.id),
    refetchInterval: 30_000,
  })),
});

// 构建 instance 列表（所有 node，不管是否部署）
const instances = [
  {
    nodeId: 'local',
    nodeName: status?.node.name ?? 'Local',
    country: status?.node.country,
    connected: true,
    app: (localApps ?? []).find(a => a.template === template) ?? null,
  },
  ...connectedNodes.map((node, i) => ({
    nodeId: node.id,
    nodeName: node.name || node.address,
    country: node.country,
    connected: node.status === 'connected',
    app: (nodeAppQueries[i]?.data ?? []).find(a => a.template === template) ?? null,
  })),
];

// 默认选中：URL 有 nodeId 就用，否则优先本地已部署，否则第一个已部署，否则本地
const selectedNodeId = nodeId
  ?? instances.find(i => i.nodeId === 'local' && i.app)?.nodeId
  ?? instances.find(i => i.app)?.nodeId
  ?? 'local';
```

### 部署 / 卸载 mutation

```ts
// hooks/use-app-mutations.ts
function useDeployApp(template: string, nodeId: string) {
  return useMutation({
    mutationFn: async (settings: Record<string, any>) => {
      if (nodeId === 'local') {
        return api.deployApp({ template, settings });
      }
      return api.deployAppOnNode(nodeId, { template, settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'apps'] });
    },
  });
}

function useUndeployApp(appId: string, nodeId: string) {
  return useMutation({
    mutationFn: () => {
      if (nodeId === 'local') return api.deleteApp(appId);
      return api.deleteAppOnNode(nodeId, appId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'apps'] });
    },
  });
}
```

`api.deployAppOnNode` / `api.deleteAppOnNode` 如果不存在，需要在 `lib/api-client.ts` 新增，底层走 `/api/nodes/:id/apps` 代理。

### 路由更新

```ts
// web/src/app.tsx
<Route path="/apps" element={<AppsPage />} />
<Route path="/apps/new" element={<DeployWizard />} />
<Route path="/apps/:template" element={<AppDetailPage />} />
<Route path="/apps/:template/:nodeId" element={<AppDetailPage />} />
```

**路由歧义检查**：`/apps/new` 字面量优先于 `/apps/:template`，React Router v6 默认行为。安全。

### 列表页跳转

`web/src/features/apps/apps-page.tsx` 的 navigate：

```diff
- onClick={() => navigate(`/apps/${app.id}`)}
+ onClick={() => navigate(`/apps/${app.template}`)}
```

### Dashboard 跳转

`web/src/features/dashboard/multi-node-panel.tsx` 的 `onAppClick` 回调也要改成 template-based。

---

## 后端

**不需要改动**。

已有 API 足以支撑：
- `GET /api/apps` — 本地应用列表
- `GET /api/nodes/:id/apps` — 远程应用列表（代理）
- `POST /api/apps` / `POST /api/nodes/:id/apps` — 部署
- `DELETE /api/apps/:appId` / `DELETE /api/nodes/:id/apps/:appId` — 卸载
- `GET /api/templates` — 模板列表

**已确认**：`/api/nodes/:id/apps/*` 代理路由在 `passim/internal/api/node.go:127` (`nodeProxyHandler`) 已支持 POST/DELETE。

**可选增强（本次不做）**：
- `GET /api/apps/by-template/:name` 聚合接口 —— 目前前端聚合已经够用，不加
- "远程有、本地没有"的 template 定义同步 —— 这个问题本 spec 不解决，作为独立 issue

---

## Mobile 同步

`app-mobile/app/apps/[id].tsx` 按同样模式改：

1. 路由：`[id].tsx` → `[template].tsx` 或 `[template]/[nodeId].tsx`（取决于 expo-router 嵌套能力）
2. 同样的 instance switcher 视觉（用 NativeWind + 自定义 View 实现，不依赖 shadcn）
3. Switch 组件：React Native 的 `<Switch>` 没有 loading prop，同样需要自己包 `ActivityIndicator` 覆盖层
4. Alert 确认：`react-native`'s `Alert.alert()` 原生对话框
5. Users / Metrics / Logs tabs：复用现有结构，数据源改成"选中实例"

**参考**：`app-mobile/app/apps/[id].tsx` 现有结构大致可以保留，只是顶部加一个 instance switcher，tabs 内的数据获取改成"选中实例"。

---

## 迁移与兼容

- **旧 URL `/apps/:uuid` 直接失效** —— passim 没有外部深链接分享场景，用户从书签进入旧 URL 会 404。可接受。
- **未来若要兼容**：可以加一个 `/apps/:idOrTemplate` 的 fallback 逻辑，先当 template 查，查不到再当 id 查，重定向到新 URL。**本次不做**。

---

## 测试清单

| # | 场景 | 预期 |
|---|------|------|
| 1 | 单 node，本地一个 wireguard | 详情页正常，switcher 只有一行 |
| 2 | 本地 + 1 个远程 node，都有 wireguard | switcher 两行，切换时 tabs 内容刷新 |
| 3 | 本地 wireguard，远程有 hy2 | `/apps/wireguard` 只显示本地，`/apps/hysteria2` 只显示远程 |
| 4 | 远程有、本地没有的 template | 能进入详情页，本地行显示 "Not deployed"，可 toggle 部署 |
| 5 | Toggle 部署 | Switch 进 loading，成功后变 on，tabs 刷新 |
| 6 | Toggle 卸载 | 弹确认，确认后 loading → off |
| 7 | 卸载时用户取消 | Switch 保持 on，无 API 调用 |
| 8 | 远程 node offline | 行 dim + "Offline" 标签，Switch disabled |
| 9 | 深链接 `/apps/wireguard/remote-id` 直接访问 | 直接选中远程实例 |
| 10 | 深链接 `/apps/不存在的模板` | 显示 "No such template" empty state |
| 11 | Mobile 端对应场景 1、2、5、6 | 行为与 web 一致 |

---

## 不做的事

- **全局同 template 唯一** —— 显式拒绝，因为"家里 + 公司两台都装 wireguard"是合理场景
- **template 定义跨 node 同步** —— 需要独立设计
- **单 node 多实例同 template** —— 后端约束保留，本 spec 不打破
- **旧 UUID 路由兼容** —— 不加 fallback，直接切换
