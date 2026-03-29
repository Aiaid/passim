# Passim MCP Server 设计方案

## 概述

构建一个 MCP (Model Context Protocol) Server，让任何支持 MCP 的 LLM Agent（Claude Code、Cursor、自定义 Agent）能直接控制 Passim 实例——查看状态、管理容器、部署应用、操作多节点集群。

## 为什么做

1. **自然语言运维** — "帮我在东京节点部署个 WireGuard"，Agent 自动调用 MCP tools 完成
2. **跨实例编排** — Agent 可以同时操作多个 Passim 节点，实现批量部署、巡检
3. **可组合** — MCP 是开放协议，任何 MCP client 都能接入，不绑定特定 AI 产品
4. **Passim 本身就有完整 REST API** — MCP Server 只是一层薄封装，工作量可控

## 架构

```
┌─────────────┐     MCP (stdio/SSE)     ┌──────────────────┐     HTTP/REST     ┌─────────────┐
│  LLM Agent  │ ◄──────────────────────► │  passim-mcp-server│ ◄──────────────► │   Passim    │
│  (Claude等)  │                          │  (TypeScript)     │                  │  (Go, :8443)│
└─────────────┘                          └──────────────────┘                  └─────────────┘
                                                │
                                                ├── 复用 packages/shared createApi()
                                                └── 新增 packages/mcp/
```

### 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 语言 | TypeScript | MCP SDK 最成熟；复用现有 `packages/shared` API client |
| MCP SDK | `@modelcontextprotocol/sdk` | 官方 SDK，支持 stdio + SSE transport |
| 位置 | `packages/mcp/` | monorepo 内，pnpm workspace 管理 |
| Transport | stdio (默认) + Streamable HTTP (可选) | stdio 给本地 Agent 用；HTTP 给远程 Agent 用 |

## MCP Tools 设计

将 Passim API 按照 Agent 使用场景分组为 MCP tools。原则：

- **粗粒度** — 一个 tool 对应一个有意义的操作，不是 1:1 映射 REST endpoint
- **自描述** — 每个 tool 的 description 要让 LLM 理解何时该用
- **安全** — 破坏性操作（删除容器、删除应用）需要 `confirm: true` 参数

### 核心 Tools

#### 1. 系统 & 状态

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_status` | 获取节点系统状态（CPU/内存/磁盘/网络/容器摘要） | `GET /api/status` |
| `passim_version` | 获取版本信息和可用更新 | `GET /api/version` + `GET /api/version/check` |

#### 2. 容器管理

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_containers_list` | 列出所有容器及状态 | `GET /api/containers` |
| `passim_container_action` | 启动/停止/重启容器 | `POST /api/containers/:id/{start,stop,restart}` |
| `passim_container_logs` | 获取容器日志 | `GET /api/containers/:id/logs` |
| `passim_container_remove` | 删除容器（需 confirm） | `DELETE /api/containers/:id` |

#### 3. 应用部署

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_templates_list` | 列出可部署的应用模板 | `GET /api/templates` |
| `passim_template_detail` | 获取模板详情和配置项 | `GET /api/templates/:name` |
| `passim_app_deploy` | 部署新应用 | `POST /api/apps` |
| `passim_apps_list` | 列出已部署应用 | `GET /api/apps` |
| `passim_app_detail` | 获取应用详情 | `GET /api/apps/:id` |
| `passim_app_update` | 更新应用配置 | `PATCH /api/apps/:id` |
| `passim_app_delete` | 删除应用（需 confirm） | `DELETE /api/apps/:id` |
| `passim_app_share` | 创建/撤销应用分享链接 | `POST/DELETE /api/apps/:id/share` |
| `passim_app_client_config` | 获取应用客户端连接配置 | `GET /api/apps/:id/client-config` |

#### 4. 任务追踪

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_tasks_list` | 列出异步任务 | `GET /api/tasks` |
| `passim_task_detail` | 获取任务详情和进度 | `GET /api/tasks/:id` |

#### 5. 多节点管理

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_nodes_list` | 列出远程节点 | `GET /api/nodes` |
| `passim_node_add` | 添加远程节点 | `POST /api/nodes` |
| `passim_node_remove` | 移除远程节点（需 confirm） | `DELETE /api/nodes/:id` |
| `passim_node_status` | 获取远程节点状态 | `GET /api/nodes/:id/status` |
| `passim_node_containers` | 列出远程节点容器 | `GET /api/nodes/:id/containers` |
| `passim_node_apps` | 列出远程节点应用 | `GET /api/nodes/:id/apps` |
| `passim_node_deploy` | 在远程节点部署应用 | `POST /api/nodes/:id/apps` |
| `passim_batch_deploy` | 批量部署到多个节点 | `POST /api/batch/deploy` |

#### 6. 系统运维

| Tool | 描述 | 对应 API |
|------|------|----------|
| `passim_update` | 执行自更新（需 confirm） | `POST /api/update` |
| `passim_ssl_status` | 查看 SSL 证书状态 | `GET /api/ssl/status` |
| `passim_settings` | 查看/修改节点设置 | `GET/PATCH /api/settings` |

### Tool Schema 示例

```typescript
// passim_app_deploy
{
  name: "passim_app_deploy",
  description: "Deploy a new application from a template. Use passim_templates_list first to see available templates and passim_template_detail to check required settings.",
  inputSchema: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description: "Template name (e.g. 'wireguard', 'nextcloud')"
      },
      settings: {
        type: "object",
        description: "Template-specific settings. Use passim_template_detail to see available options.",
        additionalProperties: true
      },
      node_id: {
        type: "string",
        description: "Optional: deploy on a remote node instead of local. Use passim_nodes_list to find node IDs."
      }
    },
    required: ["template"]
  }
}

// passim_container_action
{
  name: "passim_container_action",
  description: "Start, stop, or restart a container. Use passim_containers_list to find container IDs.",
  inputSchema: {
    type: "object",
    properties: {
      container_id: { type: "string", description: "Container ID or name" },
      action: { type: "string", enum: ["start", "stop", "restart"] },
      node_id: { type: "string", description: "Optional: target a remote node's container" }
    },
    required: ["container_id", "action"]
  }
}
```

## MCP Resources

除了 Tools，MCP 也支持 Resources（只读数据源），适合提供上下文：

| Resource URI | 描述 |
|-------------|------|
| `passim://status` | 当前节点状态（动态） |
| `passim://templates` | 可用模板列表 |
| `passim://apps` | 已部署应用列表 |
| `passim://nodes` | 节点列表及摘要状态 |

Resources 让 Agent 在对话开始时自动获取上下文，减少 tool call 次数。

## 认证方案

```typescript
// 通过环境变量或配置文件传入
{
  PASSIM_URL: "https://your-server:8443",
  PASSIM_API_KEY: "psk_..."
}
```

MCP Server 启动时用 API Key 换取 JWT，之后自动 refresh。用户不需要在每次对话中提供凭证。

支持多实例配置（管理多台 Passim）：

```json
{
  "passim_instances": [
    { "name": "tokyo", "url": "https://tokyo.example.com:8443", "api_key": "psk_..." },
    { "name": "home",  "url": "https://home.example.com:8443",  "api_key": "psk_..." }
  ]
}
```

多实例时，每个 tool 增加可选 `instance` 参数，默认用第一个。

## 目录结构

```
packages/mcp/
├── package.json
├── tsconfig.json
├── tsup.config.ts            # 构建配置，输出 dist/bin/passim-mcp.js
├── src/
│   ├── server.ts             # McpServer 配置、tool/resource 注册
│   ├── auth.ts               # API Key → JWT，自动 refresh
│   ├── client.ts             # 封装 createApi()，多实例管理
│   ├── bin/
│   │   └── passim-mcp.ts     # CLI 入口 (#!/usr/bin/env node)
│   └── tools/
│       ├── status.ts         # passim_status, passim_version
│       ├── containers.ts     # passim_containers_*, passim_container_*
│       ├── apps.ts           # passim_app_*, passim_templates_*
│       ├── nodes.ts          # passim_node_*, passim_batch_deploy
│       ├── tasks.ts          # passim_tasks_*, passim_task_*
│       └── system.ts         # passim_update, passim_ssl_*, passim_settings
└── dist/                     # 构建产物
    └── bin/
        └── passim-mcp.js
```

## 使用方式

### Claude Code / Cursor 配置

```json
// ~/.claude/settings.json 或 .mcp.json
{
  "mcpServers": {
    "passim": {
      "command": "npx",
      "args": ["passim-mcp"],
      "env": {
        "PASSIM_URL": "https://your-server:8443",
        "PASSIM_API_KEY": "psk_xxx"
      }
    }
  }
}
```

### 使用场景示例

```
用户: 帮我看看服务器状态
Agent: [调用 passim_status] → 你的服务器 CPU 12%，内存 4.2/8GB，3 个容器运行中...

用户: 东京节点部署个 WireGuard，默认配置就行
Agent: [调用 passim_templates_list] → 找到 wireguard 模板
       [调用 passim_template_detail("wireguard")] → 查看配置项
       [调用 passim_node_deploy(nodeId, template="wireguard")] → 已部署，task_id: xxx
       [调用 passim_task_detail(taskId)] → 部署完成！
       [调用 passim_app_client_config(appId)] → 这是你的 WireGuard 配置...

用户: 把那个一直 stopped 的 redis 容器删了
Agent: [调用 passim_container_remove(id, confirm=true)] → 已删除

用户: 所有节点都更新到最新版本
Agent: [调用 passim_nodes_list] → 3 个节点
       [对每个节点调用 passim_version + passim_update] → 全部更新完成
```

## 实现状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| **P1** | 基础框架 + 认证 + status/version/containers tools | Done |
| **P2** | apps/templates/tasks tools | Done |
| **P3** | nodes + batch deploy tools | Done |
| **P4** | Resources + Streamable HTTP transport | TODO |
| **P5** | 发布 npm 包 | TODO |

## 安全考量

1. **API Key 不暴露给 LLM** — MCP Server 持有 key，LLM 只看到 tool 调用结果
2. **破坏性操作需 confirm** — 删除容器/应用/节点、执行更新都需要显式确认参数
3. **日志审计** — 所有 tool 调用记录到 stderr，方便追溯
4. **最小权限** — 未来可支持 read-only 模式（只暴露查询类 tools）
