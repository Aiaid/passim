# Docker Compose Stacks 详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md)、[spec-app.md](./spec-app.md)、[spec-templates.md](./spec-templates.md) 使用

---

## 概述

Passim 当前提供两层应用形态:

| 形态 | 面向用户 | 输入 | 后端机制 |
|------|---------|------|---------|
| **App** | 普通人 | 模板 + 设置项 | 单容器 (`POST /api/apps`) |
| **Container** | 进阶用户 | docker run 风格 | 单容器 CRUD (`/api/containers`) |

本规范引入第三层 **Stack**,补足"多容器编排"场景:

| 形态 | 面向用户 | 输入 | 后端机制 |
|------|---------|------|---------|
| **Stack** | 进阶用户 | 一份 `compose.yaml` | 解析后批量起容器 (`/api/stacks`) |

目标是让用户**直接粘贴一份 docker compose YAML 就能跑起来**,覆盖 Immich / Paperless-ngx / Nextcloud / n8n 这类官方只发 compose 的自托管应用。Stack 不取代 App,App 仍然是普通人首选;Stack 是给"会写 compose"的进阶用户。

Stack 与 Container 一起被收纳进 **高级模式 (Advanced Mode)** —— 默认隐藏,普通人看不到,在 Settings 里打开开关后才出现。

---

## 目标 / 非目标

### 目标

- 用户能在 Web 或 App 里粘贴一份 compose.yaml,点"部署",后端解析、拉镜像、按依赖顺序起容器,过程接到 Task + SSE,UI 实时看到进度
- 部署后能在 Stacks 列表里看到,点进去能看到每个 service 的容器状态、日志、重启
- 删除 Stack 时干净清理(容器 + 网络 + 命名卷,可选保留卷)
- Stack 部署的所有容器同时打 Passim 标签 (`passim.stack=<name>`) 和 Compose 标签 (`com.docker.compose.project=<name>`),用户想用 `docker compose` CLI 手动接管也认得
- 跟现有 `internal/docker.Client` 的 SDK 路径**保持一致**,沿用 DinD volume 改写、网络策略、Task/SSE 进度
- 不依赖容器内的 docker CLI / compose plugin,镜像不变大

### 非目标

- 不支持 `build:` —— yaml 出现 `build:` 字段直接前端校验报错
- 不支持 swarm 特性 (`deploy.replicas`/`mode`/`endpoint_mode`/`placement`)
- 不支持 `configs` / `secrets` 的 `external: true` (Passim 不管理 swarm 级 secret store)
- 第一版**不**做多 yaml 文件合并 (`-f` override)
- 第一版**不**做 stack 跨节点部署(单节点本地 stack 优先;远程节点通过现有 node proxy 转发)

---

## 用户故事

> US-S1 — Immich 一键起
>
> 我从 Immich 官网复制 docker-compose.yml,在 Passim 的 "Stacks → 新建" 里粘贴,选 profile=`""`(默认),点部署。后端拉 4 个镜像、按 depends_on 顺序起 redis → database → server,UI 实时显示每个 service 的状态和拉镜像进度。

> US-S2 — 隐藏复杂度
>
> 我妈用 Passim 部署 WireGuard 和 Tailscale,她从来没在导航里看到过"容器"和"Stacks",界面只有 App / 节点 / 设置。

> US-S3 — 高级用户开机器
>
> 我作为家庭 IT 管家,在 Settings 里打开"高级模式",出现 Containers 和 Stacks 入口。我把家里的 Immich + Paperless + Vaultwarden 三个 stack 都粘贴进去,点 down 时勾选"保留卷",数据安全。

> US-S4 — 用 docker CLI 兜底
>
> 我有时候 SSH 上 Passim 主机,直接跑 `docker compose -p immich ps` 也能看到 Passim 起的容器,因为容器都打了标准的 `com.docker.compose.*` 标签。

---

## 高级模式 (Advanced Mode)

### 行为定义

| 状态 | 主导航可见入口 |
|------|--------------|
| OFF (默认) | Apps / Nodes / Settings |
| ON | Apps / **Containers** / **Stacks** / Nodes / Settings |

- **默认 OFF** —— 全新用户、所有现有用户升级后都是 OFF。这是一次行为变更:旧版 Web/App 默认能看到 Containers 页,本次发布后会被藏起来,需要在 Settings 里手动打开。
- 不做"自动迁移检测"(原计划检测到非 Passim 模板起的容器就自动开,讨论后认为复杂度不值)。Release Notes + Settings 页给醒目提示即可。
- 不做基于角色/账号的权限控制(passim 没有多用户模型),开关是节点全局的。

### 持久化

- 存到现有 `config` 表 (KV),键名 `advanced_mode`,值 `"1"` / `"0"`
- 不在 localStorage 存,这样 Web 和 App 跨设备一致
- 默认值由后端返回:未设置 → `false`

### API

扩展 `GET /api/settings` 和 `PATCH /api/settings`:

```json
GET /api/settings
{
  "node_name": "home-server",
  "advanced_mode": false
}

PATCH /api/settings
{ "advanced_mode": true }
→ 200 { "ok": true }
```

校验:`advanced_mode` 只接受 bool。

---

## Compose 特性支持矩阵

✅ 支持 / ⚠️ 部分支持 / ❌ 拒绝

### `services.<name>` 字段

| 字段 | 状态 | 备注 |
|------|------|------|
| `image` | ✅ | 唯一允许的镜像来源 |
| `build` | ❌ | yaml 出现就报错 (`stack.build_not_supported`) |
| `container_name` | ⚠️ | 允许但会被覆盖为 `<project>_<service>_1`,以避免跨 stack 冲突 |
| `command` / `entrypoint` | ✅ | 直接传 docker SDK |
| `environment` (map / list) | ✅ | 支持 `${VAR}` 插值,值从 stack `environment` 字段或 `.env` 内容(可选粘贴) |
| `env_file` | ❌ | 第一版不支持(要求用户改成 inline `environment`) |
| `ports` (short + long form) | ✅ | 解析后走现有 `ParsePortMappings` |
| `expose` | ✅ | 仅声明 ExposedPorts,不绑定 host |
| `volumes` (bind / named / tmpfs short+long) | ✅ | 走现有 `splitVolumes` 做 DinD 路径改写 |
| `networks` (短列表 / 带 alias 的对象) | ✅ | 默认网络 `<project>_default` |
| `depends_on` (短列表) | ✅ | 等同 `condition: service_started` |
| `depends_on` (长格式 + condition) | ✅ | 三种 condition 全支持: `service_started` / `service_healthy` / `service_completed_successfully` |
| `healthcheck` | ✅ | 全字段支持 (`test` / `interval` / `timeout` / `retries` / `start_period`) |
| `restart` | ✅ | `no` / `always` / `unless-stopped` / `on-failure[:N]` |
| `labels` | ✅ | 与 Passim 自动注入的 label 合并(用户 label 优先,但保留字以 `passim.` 和 `com.docker.compose.` 开头的会被覆盖) |
| `cap_add` / `cap_drop` | ✅ | |
| `sysctls` | ✅ | |
| `extra_hosts` | ✅ | |
| `tmpfs` | ✅ | |
| `user` | ✅ | |
| `working_dir` | ✅ | |
| `tty` / `stdin_open` | ✅ | |
| `init` | ✅ | |
| `pid` / `ipc` | ✅ | 接受 `host` / `none` / `container:<id>` / `service:<svc>` |
| `network_mode` | ✅ | **明确支持**。接受 `bridge` / `host` / `none` / `container:<container-id-or-name>` / `service:<svc>`。<br>**`service:<svc>` 语义**:部署时把 `<svc>` 映射为同 stack 内该 service 的主容器 ID(`container:<id>` 形式),再传给 docker SDK `NetworkMode`。引用方自动获得对被引用 service 的**隐式 depends_on (condition=service_started)**,因此被引用 service 必须先起。若 `<svc>` 不存在同 stack 内 → `stack.network_mode_unknown_service`。若 `<svc>` 与引用方成环 → `stack.depends_on_cycle`(拓扑阶段检出) |
| `privileged` | ✅ | |
| `read_only` | ✅ | |
| `shm_size` | ✅ | |
| `dns` / `dns_search` | ✅ | |
| `mem_limit` / `cpus` / `cpu_shares` | ✅ | |
| `profiles` | ✅ | 见 [Profiles](#profiles) |
| `extends` | ✅ | 仅允许引用**同一份 yaml** 内的其它 service。`extends.file` 字段出现就报错 (`stack.extends_external_file_not_supported`) |
| `deploy.*` | ❌ | swarm-only,出现就警告并忽略(不报错,因为很多 yaml 拷贝来时带着) |
| `configs` (引用) | ✅ | 见 [Configs / Secrets 物化](#configs--secrets-物化) |
| `secrets` (引用) | ✅ | 同上 |
| `logging` | ⚠️ | **白名单明确**。接受以下三种情况:<br>① 省略 `logging:`(Docker daemon 默认)<br>② `driver: json-file` + options 子集 `{max-size, max-file, labels, tag}`<br>③ `driver: local` + options 子集 `{max-size, max-file, compress}`<br>任何其它 driver(`syslog` / `journald` / `gelf` / `fluentd` / `awslogs` / `splunk` / `etwlogs` / `none`)或未列出的 option key → `stack.unsupported_logging_driver` |

### 顶层字段

| 字段 | 状态 | 备注 |
|------|------|------|
| `version` | ✅ | 解析时忽略(现代 compose 规范无视) |
| `name` | ✅ | 如果未提供,以用户在 UI 输入的 stack name 为准 |
| `services` | ✅ | 必须存在 |
| `networks` | ✅ | 见 [网络](#网络) |
| `volumes` | ✅ | 见 [命名卷](#命名卷) |
| `configs` | ✅ | 见 [Configs / Secrets 物化](#configs--secrets-物化) |
| `secrets` | ✅ | 同上 |
| `x-*` 扩展字段 | ✅ | 允许出现,解析时忽略 |

---

## 数据模型

### `stacks` 表

```sql
CREATE TABLE IF NOT EXISTS stacks (
    id           TEXT PRIMARY KEY,             -- uuid
    name         TEXT NOT NULL UNIQUE,         -- compose project name, [a-z0-9][a-z0-9_-]{0,62}
    yaml_text    TEXT NOT NULL,                -- 原始 yaml 全文 (用户粘贴的内容)
    env_text     TEXT NOT NULL DEFAULT '',     -- 可选 .env 文本 (KEY=VALUE 行)
    profiles     TEXT NOT NULL DEFAULT '[]',   -- JSON array, 当前激活的 profiles
    status       TEXT NOT NULL DEFAULT 'stopped', -- stopped / deploying / running / error / tearing_down
    last_error   TEXT,                         -- 最近一次失败的简短描述
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);
```

### `name` 字段约束

- `^[a-z0-9][a-z0-9_-]{0,62}$` —— compose project name 的常见限制(全小写、字母数字开头)
- 全局唯一(数据库约束 + UI 校验)
- 用户输入 `Immich Stack` 这种带空格大写的会被规范化为 `immich-stack`,UI 实时展示规范化结果

### service ↔ container 映射

**不**在 DB 双写映射表。运行时通过 docker label 反查:

```go
filters := filters.NewArgs()
filters.Add("label", "passim.stack="+stack.Name)
containers, _ := docker.ListWithFilters(ctx, filters)
```

理由:
- 容器可能被用户从 docker CLI 手动 stop/rename,DB 表会过时
- compose 自己也是这么做的(纯靠 label 查)
- 简化:删除一个 stack 的所有容器只是 `docker rm $(docker ps -aq -f label=passim.stack=foo)`

---

## Label 方案

每个 stack-managed 容器都同时打两套 label:

```
# Passim 自有
passim.stack=<stack-name>
passim.stack.service=<service-name>
passim.stack.id=<stack-uuid>            # 删 stack 用 id 反查更稳

# Compose 兼容(让 docker compose CLI 能接管)
com.docker.compose.project=<stack-name>
com.docker.compose.service=<service-name>
com.docker.compose.container-number=1
com.docker.compose.version=2.x
com.docker.compose.oneoff=False
```

network / volume 也打:

```
passim.stack=<stack-name>
com.docker.compose.project=<stack-name>
com.docker.compose.network=<network-name>     # network only
com.docker.compose.volume=<volume-name>       # volume only
```

**用户冲突处理**: 如果用户在 `services.<name>.labels` 里写了 `passim.stack=foo` 试图伪装,Passim 会**强制覆盖**(覆盖前在校验阶段警告)。

---

## 部署流程

```
POST /api/stacks
  body: { name, yaml_text, env_text, profiles }

  ┌─ 1. 同步阶段(在 HTTP 请求线程内,失败立刻返回 4xx)
  │
  │  a. validate name
  │  b. compose-go Load(yaml_text + env_text):
  │     - 校验语法
  │     - 展开 extends (同文件内)
  │     - 应用 profiles 过滤 services
  │     - 拒绝: build: / env_file: / extends.file: / unknown logging driver
  │  c. 构建 service 拓扑图,检测循环
  │  d. 写 stacks 表 (status=deploying)
  │  e. 创建 task (type=stack-up, target=<stack-id>)
  │  f. 返回 202 + { stack_id, task_id }
  │
  └─ 2. 异步阶段 (task worker 执行,SSE 推进度)
     │
     a. ensure networks
        - 顶层 networks 全部物化:passim 自有 + external: true 检测存在
        - 默认网络 <project>_default 总是创建
     b. ensure volumes
        - 顶层 volumes 全部物化(命名卷)
        - external: true 检测存在,不存在 → fail
     c. 物化 configs / secrets
        - 写到 DataDir/stacks/<name>/configs/<file>
        - 写到 DataDir/stacks/<name>/secrets/<file>  (mode 0600)
     d. pull 镜像 (并发,每个镜像独立的 SSE 进度)
     e. 拓扑排序,按依赖顺序起容器
        - 同一层内并发起
        - depends_on=service_started: 等容器 Started 即可
        - depends_on=service_healthy: 等 healthcheck Healthy
        - depends_on=service_completed_successfully: 等容器 Exit 0(用于 init 容器)
        - 任一依赖等待超时或失败 → 整个 stack fail
     f. update stacks.status = running (成功) 或 error (任一步失败 → 回滚 → 清零)
```

### 失败回滚策略 — all-or-nothing

Stack 部署采用 **全有或全无** 语义,跟现有 App 部署保持一致,**不**采用 docker compose 默认的 "留下已起容器" 行为。理由是 Passim 定位偏产品化而非运维工具,用户期望"部署失败 = 干净如初",而不是面对一个半吊子状态要自己排查。

| 阶段 | 失败处理 |
|------|---------|
| **同步校验** (parse / 拓扑 / 入库前) | 不写 DB,直接 4xx。无副作用。 |
| **ensure 网络 / 卷** | DB `status=error`, `last_error` 记原因;**拆除**该次部署刚创建的 network / volume(external 的不动);物化到磁盘的 configs/secrets 目录删除。 |
| **pull 镜像** | 同上(回滚 net/vol/files);已部分 pull 的镜像**不删**(镜像是共享资源,别的 stack 或用户可能在用,docker daemon 自己会做引用计数)。 |
| **起容器中途失败** | DB `status=error`, `last_error` 记"service <name> failed: ...";**把本次已成功起的所有容器全部 stop + rm**(按拓扑逆序),然后拆 network / volume / 物化文件。结果:这次部署完全没有副作用。 |
| **depends_on 等待超时**(如 healthcheck 不通) | 等同"起容器中途失败"。 |

**实现要点**:
- deployer 维护一个 `rollback []func()` 栈,每个成功步骤把 undo 函数 push 进去;失败时逆序执行。
- 拆容器用 `force=true` 强删,避免等待优雅停机拖延;除非用户的 `stop_grace_period` 设置特别高(那是用户自己的选择,rollback 里还是强删,因为这是异常路径)。
- 回滚本身失败(比如 docker daemon 挂了)只记日志 + `last_error` 追加,DB 仍然进 `error` 状态,UI 明显提示"部署失败且自动清理未完成",用户可以手动 `Down`(DELETE /api/stacks/:id) 再清一次。

**status 枚举**:

| 值 | 含义 |
|---|------|
| `stopped` | 从未部署 / 已 `down` |
| `deploying` | 正在走部署流程(含回滚阶段) |
| `running` | 所有 service 已起,且达到各自依赖要求的状态 |
| `error` | 部署失败,容器已回滚清零。需要用户修 yaml 重试 |
| `tearing_down` | 正在执行 `DELETE` 或 `down` |

**没有 `partial` 状态。** Stack 要么 running,要么没起来。

### 并发与互斥

- 同一个 stack 在 deploying / down / restart 期间禁止并发触发同类操作 —— 用 `stacks.id` 做内存级 mutex
- 不同 stack 之间互不影响

---

## API 设计

所有路由挂在 `/api/stacks`,JWT 保护。

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/stacks/validate` | 仅校验 yaml,不入库,前端实时反馈用 |
| `POST` | `/api/stacks` | 创建 + 部署(异步) |
| `GET` | `/api/stacks` | 列表(含每个 stack 的 service 数 + 状态聚合) |
| `GET` | `/api/stacks/:id` | 详情(含 yaml + 解析后的 services 列表 + 每个 service 的容器状态) |
| `PUT` | `/api/stacks/:id` | 更新 yaml / env / profiles,触发 redeploy(diff: 改了的 service stop+start,没改的留着) |
| `DELETE` | `/api/stacks/:id` | down + 删容器 + 删 stack 记录;query `?keep_volumes=true` 保留命名卷 |
| `POST` | `/api/stacks/:id/up` | 在 stopped 状态时重新拉起 |
| `POST` | `/api/stacks/:id/down` | 停止 + 删容器,保留 stack 记录 |
| `POST` | `/api/stacks/:id/restart` | 全部 service 重启 |
| `POST` | `/api/stacks/:id/services/:svc/restart` | 单个 service 重启 |
| `GET` | `/api/stacks/:id/logs` | 聚合多 service 日志 (SSE),query `?service=<name>` 过滤 |
| `GET` | `/api/stacks/:id/events` | Stack 部署事件流 (SSE),前端 deploy 进度用 |

### 远程节点

通过现有 `nodeProxyHandler` 透明转发:

| Method | Path |
|--------|------|
| `GET` | `/api/nodes/:id/stacks` |
| `POST` | `/api/nodes/:id/stacks` |
| `DELETE` | `/api/nodes/:id/stacks/:stackId` |
| ... | (其余镜像) |

### 响应示例

`GET /api/stacks/:id`:

```json
{
  "id": "uuid",
  "name": "immich",
  "status": "running",
  "yaml_text": "...",
  "env_text": "DB_PASSWORD=...",
  "profiles": [],
  "services": [
    {
      "name": "redis",
      "image": "redis:6.2-alpine",
      "container_id": "abc123",
      "status": "running",
      "health": "healthy",
      "ports": ["6379:6379"]
    },
    {
      "name": "database",
      "image": "tensorchord/pgvecto-rs:pg14-v0.2.0",
      "container_id": "def456",
      "status": "running",
      "health": "healthy",
      "ports": []
    }
  ],
  "networks": ["immich_default"],
  "volumes": ["immich_model-cache", "immich_db-data"],
  "created_at": "2026-04-11T...",
  "updated_at": "2026-04-11T..."
}
```

`POST /api/stacks/validate`:

```json
// 请求
{ "yaml_text": "...", "env_text": "..." }

// 成功
{
  "ok": true,
  "name": "immich",                  // 从 yaml 顶层 name 字段
  "services": ["redis", "database", "server"],
  "warnings": [
    "service.server.deploy: ignored (swarm-only)"
  ]
}

// 失败
{
  "ok": false,
  "errors": [
    {
      "code": "stack.build_not_supported",
      "message": "service.server.build is not supported, use 'image:' instead",
      "location": { "line": 42, "column": 5 }
    }
  ]
}
```

错误 `code` 字段命名采用 `stack.<reason>` 风格,前端用 `code` 翻译成本地化文案,`message` 是英文兜底。

---

## Configs / Secrets 物化

compose 规范里 `configs` / `secrets` 顶层声明 + service 引用,Passim 把它们物化到磁盘后挂到容器里。

### 顶层声明只支持两种来源

```yaml
configs:
  caddy_config:
    content: |              # ✅ inline content
      :80 {
        respond "hello"
      }
  nginx_config:
    file: ./nginx.conf      # ✅ file 引用,但相对路径无意义(用户没法上传文件)
                            # 第一版要求用 inline content,file: 路径必须以 /data 开头
                            # (用户已经放在 DataDir 里的文件)
secrets:
  db_password:
    content: "supersecret"  # ✅ inline
```

`external: true` ❌ 拒绝(`stack.configs_external_not_supported` / `stack.secrets_external_not_supported`)。

### 物化路径

```
DataDir/stacks/<stack-name>/
├── configs/
│   ├── caddy_config        # 644
│   └── nginx_config        # 644
└── secrets/
    └── db_password         # 600
```

### Service 引用 → 容器内挂载

```yaml
services:
  caddy:
    configs:
      - source: caddy_config
        target: /etc/caddy/Caddyfile         # 默认 /<source>
        mode: 0644
    secrets:
      - source: db_password
        target: /run/secrets/db_password     # 默认 /run/secrets/<source>
        mode: 0400
```

部署时这些引用被翻译成 bind mount(volume specs),走现有 `splitVolumes` 的 DinD 路径改写。

### 删除策略

`DELETE /api/stacks/:id` 时,默认**删除** `stacks/<name>/` 目录;`?keep_volumes=true` 同时保留 configs/secrets 目录(因为可能被 volume 引用)。

---

## 网络

### 默认网络

每个 stack 自动创建 `<project>_default` bridge 网络。所有 service 默认接入,service 名作为 DNS alias。

### 用户声明网络

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
  shared:
    external: true
    name: passim          # 复用 Passim 自己的 network
```

- `driver`: 只支持 `bridge`,其它驱动报错
- `internal: true`: 支持(传 docker SDK `Internal: true`)
- `external: true`: 必须 + `name`,部署时检测网络存在,不存在报错
- `attachable`: 支持
- `ipam`: 第一版不支持(报错)

### Service 接入

```yaml
services:
  app:
    networks:
      - frontend
      - backend
  db:
    networks:
      backend:
        aliases: [postgres, db.internal]
```

走 docker SDK `NetworkConnect` 的 `EndpointSettings.Aliases`。

---

## 命名卷

### 顶层声明

```yaml
volumes:
  pgdata:                  # 默认: 名为 <project>_pgdata 的 docker named volume
  cache:
    driver: local
  legacy:
    external: true
    name: my-old-volume
```

- `driver`: 只支持 `local`
- `driver_opts`: 透传给 docker SDK(用户自负其责)
- `external: true`: 必须 + `name`,部署时检测卷存在,不存在报错
- `labels`: 合并 Passim 自动注入的 label

### 删除策略

`DELETE /api/stacks/:id`:
- 默认: 删除所有 stack 创建的命名卷(external 的不删)
- `?keep_volumes=true`: 全部保留

---

## Profiles

```yaml
services:
  app:
    image: foo
  debug:
    image: bar
    profiles: [debug]      # 只有指定 debug profile 才起
```

- 创建 / 更新 stack 时 `profiles: ["debug", "monitoring"]` 数组传入
- 后端走 compose-go 的 profile 过滤逻辑
- 没声明 `profiles` 的 service 总是会起
- 改 profiles 触发 redeploy

---

## 实现技术选型

### 库

```go
require (
    github.com/compose-spec/compose-go/v2 v2.x.x   // compose 解析
)
```

`compose-go` 是 docker 官方维护的库,docker compose CLI 自身也用它,支持完整 compose 规范 (extends / profiles / interpolation)。

### 包结构

```
passim/internal/
├── stack/                  # 新建
│   ├── parser.go           # compose-go 包装 + 校验拒绝项
│   ├── parser_test.go
│   ├── topology.go         # depends_on 拓扑排序
│   ├── topology_test.go
│   ├── deployer.go         # ensure net/vol → pull → 顺序起
│   ├── deployer_test.go
│   ├── label.go            # passim.* + com.docker.compose.* label 生成
│   ├── label_test.go
│   ├── files.go            # configs/secrets 物化
│   ├── files_test.go
│   └── store.go            # stacks 表 CRUD
├── api/
│   └── stack.go            # HTTP handlers (新建)
└── docker/
    └── client.go           # 扩展 ContainerConfig: Healthcheck/Tmpfs/Privileged/...
```

### Docker 客户端扩展

`docker.ContainerConfig` 现在没有 healthcheck / tmpfs / privileged / shm_size / 资源限制等字段,要补:

```go
type ContainerConfig struct {
    // ...existing...
    Healthcheck *HealthcheckConfig
    Tmpfs       map[string]string
    Privileged  bool
    ReadOnly    bool
    User        string
    WorkingDir  string
    Tty         bool
    StdinOpen   bool
    Init        *bool
    PidMode     string
    IpcMode     string
    NetworkMode string
    ShmSize     int64
    MemLimit    int64
    NanoCPUs    int64
    DNS         []string
    DNSSearch   []string
    StopSignal  string
    StopTimeout *int
}

type HealthcheckConfig struct {
    Test        []string       // ["CMD-SHELL","curl -f localhost"] / ["NONE"]
    Interval    time.Duration
    Timeout     time.Duration
    Retries     int
    StartPeriod time.Duration
}
```

要确保**所有现有 App 部署路径**也能用上这些新字段(比如 App 模板加 healthcheck 是个免费收益)。

### Task type

新增两个 task type:

| Type | Payload | Handler |
|------|---------|---------|
| `stack-up` | `{stack_id}` | `stackUpHandler` |
| `stack-down` | `{stack_id, keep_volumes}` | `stackDownHandler` |

`stack-restart` 不必单独 task,handler 内部 = down + up。

---

## UI 设计

### Web (`web/`)

**Settings 页**:在 "Node Name" 下方加一个 toggle:

```
┌────────────────────────────────────────────────┐
│  高级模式                              [   ●  ] │
│  显示容器和 Stacks 管理。仅推荐熟悉 Docker 的用户。 │
└────────────────────────────────────────────────┘
```

**主导航**:由 `useSettings()` hook 读 `advanced_mode`,渲染时动态过滤入口。

**Stacks 路由** (`/stacks`):
- 列表页:卡片式,每卡片显示 stack name / status / service 数 / 网络数 / 卷数 / 创建时间。状态色:`running`(绿)/ `deploying`(蓝,带动画)/ `tearing_down`(蓝,带动画)/ `error`(红,显示 `last_error` 摘要 tooltip)/ `stopped`(灰)
- 新建对话框:左侧 monaco-editor 粘贴 yaml,右侧实时调用 `/api/stacks/validate`,显示 "✓ N services / M warnings" 或具体错误位置。下方一栏粘贴 .env(可选)。底部 profiles 多选(从 yaml 解析出的 profile 列表)
- 详情页:顶部 stack 信息 + actions (Up/Down/Restart/Delete);中间 service 表格 (name / image / status / health / ports / 操作);下方折叠的 yaml 查看 + 编辑

**关键组件**:

```
web/src/features/stacks/
├── stacks-list.tsx
├── stack-detail-panel.tsx
├── stack-create-dialog.tsx
├── stack-yaml-editor.tsx        # monaco + yaml schema (可选)
├── stack-service-row.tsx
├── stack-events-stream.tsx      # SSE 进度展示
└── use-stack.ts                 # react-query hooks
```

### Mobile (`app-mobile/`)

**Settings 页**:同 Web,toggle 控件。

**Tab 导航** (`(tabs)/_layout.tsx`):根据 `advanced_mode` 动态渲染 tabs。OFF 时 4 个 tab (Dashboard / Apps / Nodes / Settings),ON 时插入 Containers + Stacks。

**Stacks 页面**:
- 列表:RN ScrollView + 卡片
- 新建:全屏 sheet,monaco 太重不用,改用 RN 的 textarea + 简单语法高亮(`react-native-syntax-highlighter` 或纯文本)。validate 走防抖
- 详情:同 Web 结构,actions 用 sheet 弹出确认

**关键组件**:

```
app-mobile/app/(tabs)/stacks.tsx
app-mobile/app/stacks/[id].tsx
app-mobile/app/stacks/new.tsx
app-mobile/components/stacks/...
```

复用 `packages/shared/api/stacks.ts` 里的 API client + 类型,Web 和 Mobile 共享。

---

## 错误码字典

| Code | HTTP | 含义 |
|------|------|------|
| `stack.invalid_name` | 400 | 名字不符合 `[a-z0-9_-]` |
| `stack.name_taken` | 409 | 同名 stack 已存在 |
| `stack.yaml_parse_error` | 400 | yaml 解析失败 |
| `stack.build_not_supported` | 400 | 出现 `build:` |
| `stack.env_file_not_supported` | 400 | 出现 `env_file:` |
| `stack.extends_external_file_not_supported` | 400 | `extends.file:` 不允许 |
| `stack.configs_external_not_supported` | 400 | `configs.<x>.external: true` |
| `stack.secrets_external_not_supported` | 400 | `secrets.<x>.external: true` |
| `stack.network_external_missing` | 400 | external network 不存在 |
| `stack.volume_external_missing` | 400 | external volume 不存在 |
| `stack.unsupported_logging_driver` | 400 | logging driver 不在白名单 (`json-file` / `local`),或使用了未列出的 option key |
| `stack.unsupported_network_driver` | 400 | network driver ≠ `bridge` |
| `stack.unsupported_volume_driver` | 400 | volume driver ≠ `local` |
| `stack.depends_on_cycle` | 400 | 依赖图存在循环 |
| `stack.depends_on_unknown_service` | 400 | depends_on 引用了未声明的 service |
| `stack.deploy_busy` | 409 | 同一个 stack 已经在部署中 |
| `stack.network_mode_unknown_service` | 400 | `network_mode: service:<x>` 引用了 stack 内未声明的 service |
| `stack.image_pull_failed` | — | 异步阶段错误,通过 task 事件流回报,触发 all-or-nothing 回滚 |
| `stack.healthcheck_timeout` | — | 同上 |
| `stack.rollback_failed` | — | 部署失败后自动回滚也失败,`last_error` 记录两段错误原因 |

按 [feedback_error_response.md] 用 HTTP 状态码,不使用自定义 error code wrapper —— `code` 字段只是给前端做翻译/分类,不是替代 HTTP 状态。

---

## 测试要求

### 单元 (无 Docker)

`internal/stack/parser_test.go`:
- 拒绝 `build:` / `env_file:` / `extends.file:` / `configs.x.external` / `secrets.x.external`
- `extends` 同文件展开
- profile 过滤(无 profile / 单 profile / 多 profile)
- logging 白名单:省略 / json-file + 子集 options / local + 子集 options 通过;syslog / journald / 未列出 option 一律拒绝
- network_mode: service:<svc> 被解析为 container:<id> + 隐式 depends_on(service_started);未知 service 报错;循环报错
- depends_on 长格式 condition 解析
- 表驱动覆盖 50+ 个 yaml fixture

`internal/stack/topology_test.go`:
- 无依赖 → 单层
- 链状 → 多层
- 钻石依赖 → 正确分层
- 自循环 / 互循环 → 报错
- depends_on 引用未知 service → 报错

`internal/stack/label_test.go`:
- 用户 label 与 Passim label 合并
- 用户尝试覆盖保留前缀 → Passim 优先

`internal/stack/files_test.go`:
- inline content 物化
- file 引用必须以 `/data` 开头
- secret 文件 mode 0600
- 删除目录

### 集成 (`//go:build integration`)

`internal/stack/deployer_test.go`:
- 跑一份最小 stack (nginx + redis,无 healthcheck) 验证 ensure net/vol/起容器/查 label
- depends_on=service_started: 验证启动顺序
- depends_on=service_healthy: 验证等待 healthy
- 失败回滚 (image pull 失败): 不留容器、不留本次创建的 net/vol、不留物化文件,DB status=error
- 失败回滚 (起容器中途失败): 已成功的容器按逆序全部删,副作用清零
- 回滚本身失败: DB status=error,`last_error` 包含两段原因,不留 inconsistent 状态
- DinD volume 路径改写: stack 里写 `/data/foo`,验证最终 bind 走名命卷或 host path

需要本地 Docker daemon 跑。

### E2E (`//go:build e2e`)

`internal/api/stack_e2e_test.go`:
- POST /validate 各种成功/失败响应
- POST /api/stacks → 202 + task → 完成 → GET /api/stacks/:id status=running
- DELETE /api/stacks/:id?keep_volumes=true 验证容器删了卷在
- PATCH /api/settings { advanced_mode: true } 验证持久化

### 前端

`web/src/features/stacks/*.test.tsx`(Vitest + RTL):
- yaml editor 输入触发 validate 防抖
- 错误 code → 本地化文案
- service 列表渲染状态色
- advanced_mode hook 控制 nav 渲染

`app-mobile/__tests__/stacks/*.test.tsx`(Jest + RNTL):
- Tabs 在 advanced_mode 切换时正确增减
- Stack create 流程
- 详情页 actions

### 测试覆盖目标

- `internal/stack/`: ≥ 80% line coverage
- 所有 错误码 都至少有一个测试触发
- 集成测试用真实 Docker daemon (CI 用 `services: docker:dind`)

---

## 实施分阶段

每个 phase 必须独立合入,phase 之间不留半成品。每个 phase 都要包含 doc 更新(本文档对应章节细化)+ 测试。

### Phase 1 — 骨架 (单 service)

- `stacks` 表 + migration
- `internal/stack/parser.go` 最小集: services / image / env / ports / volumes / restart
- 拒绝 build / env_file / extends.file / configs.external / secrets.external
- `internal/stack/deployer.go` 最小集: 单 service,无 net/vol/depends_on
- `POST /api/stacks/validate` + `POST /api/stacks` + `GET /api/stacks` + `GET /api/stacks/:id` + `DELETE /api/stacks/:id`
- Label 注入 (`passim.stack=*`)
- Web 列表页 + 简陋创建对话框 + 详情页(只读 yaml)

**完成判据**: 粘贴 `services: { web: { image: nginx, ports: ["8080:80"] } }`,部署成功,容器跑起来,删除时容器消失。

### Phase 2 — 网络 / 命名卷 / 多 service / 拓扑

- 顶层 `networks` / `volumes` 处理(含 external)
- 默认 `<project>_default` 网络
- `internal/stack/topology.go` 拓扑排序
- `depends_on` 短列表 (= service_started)
- compose label (`com.docker.compose.*`)
- `PUT /api/stacks/:id` redeploy
- `POST /api/stacks/:id/{up,down,restart}`
- Web 详情页 service 表格
- 接到 Task + SSE 进度

**完成判据**: 粘贴一份 wordpress + mysql 的 compose,正确按依赖顺序起。

### Phase 3 — Healthcheck / 高级 condition

- `docker.ContainerConfig` 加 Healthcheck / Tmpfs / Privileged 等字段
- compose `healthcheck:` 支持
- `depends_on` 长格式: `service_healthy` / `service_completed_successfully`
- 一次性 init 容器: 等待 exit 0,失败 stack fail
- Web 详情页显示 health 列

**完成判据**: 粘贴 Immich 官方 compose(有 healthcheck + depends_on health),起来。

### Phase 4 — Profiles / Extends / Configs / Secrets

- profile 过滤 + UI 选择
- `extends` 同文件展开
- 顶层 `configs` / `secrets` 物化(inline content + file: /data/...)
- service 引用翻译为 bind mount
- `logging` 白名单
- 全部错误码完成

**完成判据**: 粘贴 Caddy + 自定义 Caddyfile (inline config) 的 compose,起来。

### Phase 5 — 高级模式开关 + Mobile + 体验打磨

- `advanced_mode` 字段加入 settings API
- Web Settings 页 toggle + nav 动态渲染
- 隐藏现有 Containers 入口(改为 advanced_mode 控制)
- Mobile 同步实现 Stacks 全部页面
- Mobile Tab 动态渲染
- Release notes 提示进阶用户去 Settings 打开开关
- 翻译 (zh-CN / en-US) 全部文案

**完成判据**: 普通人新装 Passim 看不到 Containers / Stacks,在 Settings 点开后两者出现。

### Phase 6 (可选,后续) — Logs 聚合 / Stack 模板市场

- `GET /api/stacks/:id/logs` 多 service 聚合 SSE
- "从模板创建 stack": 把官方常用 stack(Immich / Paperless / n8n)预置成模板,一键展开成 yaml
- MCP server 增加 `passim_stacks_*` 工具

不在本文档范围,留给后续 spec 扩展。

---

## 兼容性与迁移

### 现有用户

- 升级后:**Containers 入口默认隐藏** —— 这是行为变更
- Release notes 必须置顶提示:"如果你之前用容器管理,请到 设置 → 高级模式 打开开关"
- 不做自动检测/自动开启
- API 兼容:`/api/containers/*` 路由保留,只是 UI 不直接暴露入口;通过 URL 直达仍然能用(防止现有用户的书签全炸)

### 数据库迁移

- 新增 `stacks` 表 → 加到 `migrations.go` 末尾
- `config` 表新增 KV `advanced_mode`(默认未设置 = false)→ 不需要 migration

### Docker 镜像

- 不需要装 docker CLI / compose plugin → 镜像大小不变
- 引入 `compose-go/v2` Go 依赖 → 编译期增加,运行期可忽略

---

## 风险 & 未决问题

| 风险 | 缓解 |
|------|------|
| compose-go 解析的边缘 case 跟真 docker compose 行为不一致 | 大量 fixture 测试;在文档明确"以本规范为准,以 docker compose CLI 为参考实现" |
| 用户 yaml 里写 `restart: always` 但 Passim 容器自身被 update,helper container 重启它,helper 死了的话 stack 容器也会失依 | restart 策略由 docker daemon 负责,跟 Passim 自更新无关,实际不影响 |
| DinD 模式下 stack 用相对路径 volume (`./data:/data`) | parser 阶段拒绝相对路径 host bind,要求绝对路径或命名卷;给出友好错误信息 |
| 用户用同一个端口开多个 stack | docker daemon 自己会拒绝,翻译错误信息回传 |
| advanced_mode 设置藏得太深用户找不到 | Settings 页 toggle + 文档 + Release notes |
| Mobile 上 yaml 编辑体验差 | 第一版接受,提供"扫码导入 yaml"的后续优化方向 |

---

## 参考

- [docker compose specification](https://github.com/compose-spec/compose-spec/blob/main/spec.md)
- [compose-go v2 GoDoc](https://pkg.go.dev/github.com/compose-spec/compose-go/v2)
- 现有: [spec-app.md](./spec-app.md), [spec-templates.md](./spec-templates.md)
