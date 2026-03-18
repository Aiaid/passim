# 应用模板引擎详细设计

> 配合 [spec-passim.md](./spec-passim.md) 和 [stories/epic-3-app-deployment.md](./stories/epic-3-app-deployment.md) 使用

---

## 概述

模板引擎是 Passim 部署应用的核心——它把"一键部署 WireGuard"这件事翻译成具体的 Docker 操作。每个应用模板是一个 YAML 文件，定义了容器怎么跑、用户怎么配置、配置怎么传进去、客户端配置怎么提取、用户怎么增删、用量怎么追踪。

**设计目标：**
- 一个模板文件 = 完整描述一个应用的部署和管理方式
- 屏蔽 Docker 镜像之间的差异（有的用环境变量、有的用配置文件、有的用命令行参数）
- 支持用户/客户端的完整生命周期（添加 VPN peer、删除网盘用户等）
- 支持按用户追踪用量（带宽、存储等）

**模板文件位置：** `passim/templates/*.yaml`（Docker 镜像中复制到 `/etc/passim/templates/`）

### Phase 1 实现范围

以下 schema 字段在 Phase 1 中已实现（解析 + 渲染 + 部署）：

| 字段 | 状态 |
|------|------|
| `name`, `version`, `category`, `icon` | ✅ 已实现 |
| `description` (双语) | ✅ 已实现 |
| `source`, `guide`, `limitations` | ✅ 解析，前端展示 Phase 2 |
| `container` (image, ports, volumes, cap_add) | ✅ 已实现 |
| `container.sysctls` | ✅ 已实现 (was missing from pipeline, now fixed) |
| `container.args` | ✅ 已实现 (was missing from pipeline, now fixed) |
| `container.restart` | ✅ 已实现 (was declared but not passed, now fixed) |
| `settings` (类型验证, 范围, 默认值) | ✅ 已实现 |
| `config.env`, `config.files`, `config.args` | ✅ 已实现 (Go template 渲染) |
| `generated` (random_string, uuid_v4, random_port) | ✅ 已实现 |
| `hooks` | ⬜ 解析但未执行，Phase 2 |
| `clients` (三种类型: file_per_user/credentials/url) | ✅ 解析 + 渲染 + API + 前端 |
| `share` (分享配置) | ✅ 解析 + API + 前端 (token 创建/撤销/公开访问) |
| `guide.platforms` (结构化平台指引) | ✅ 解析 + 前端展示 |
| `users` (增删管理) | ⬜ Phase 2 |
| `metrics.per_user` | ⬜ Phase 2 |

> **端口映射修复**: 端口映射已修复，ExposedPorts + PortBindings 正确传递到 Docker API。

**已有模板 (7 个)：** wireguard, l2tp, hysteria, v2ray, webdav, samba, rdesktop

---

## 模板 Schema

### 完整结构

```yaml
# ════════════════════════════════════════
# 元数据
# ════════════════════════════════════════
name: wireguard                    # 唯一标识符
version: 1.0.0                     # 模板版本
category: vpn                      # 分类: vpn / storage / remote / proxy / tool
icon: shield                       # 图标名 (lucide-react 图标名)

description:
  zh-CN: "快速安全的点对点 VPN"
  en-US: "Fast and secure point-to-point VPN"

source:
  url: "https://github.com/linuxserver/docker-wireguard"
  license: GPL-2.0
  maintainer: LinuxServer.io

guide:
  platforms:
    - name: iOS
      store_url: "https://apps.apple.com/app/wireguard/id1441195209"
      steps:
        - "安装 WireGuard App"
        - "点击 + → 从文件或归档创建"
        - "或扫描下方二维码"
    - name: Android
      store_url: "https://play.google.com/store/apps/details?id=com.wireguard.android"
      steps:
        - "安装 WireGuard App"
        - "点击 + → 从文件或归档导入"
    - name: Windows
      download_url: "https://download.wireguard.com/windows-client/wireguard-installer.exe"
      steps:
        - "下载并安装 WireGuard"
        - "点击 Import tunnel(s) from file"
    - name: macOS
      store_url: "https://apps.apple.com/app/wireguard/id1451685025"
      steps:
        - "从 App Store 安装 WireGuard"
        - "点击 Import Tunnel(s) from File"

limitations:
  - "iOS/Android 需要安装 WireGuard 客户端"
  - "UDP 协议，部分网络环境可能受限"

# ════════════════════════════════════════
# 容器定义
# ════════════════════════════════════════
container:
  image: linuxserver/wireguard:latest
  ports:
    - host: 51820
      container: 51820
      protocol: udp
      description: "WireGuard VPN 端口"
  volumes:
    - name: config
      path: /config
      description: "配置和密钥存储"
    - name: modules            # 可选
      host: /lib/modules
      path: /lib/modules
      readonly: true
  cap_add:
    - NET_ADMIN
    - SYS_MODULE
  sysctls:
    net.ipv4.conf.all.src_valid_mark: 1
  restart: unless-stopped
  healthcheck:
    test: "wg show wg0"
    interval: 30s
    timeout: 5s
    retries: 3

# ════════════════════════════════════════
# 用户可配置项 (生成 UI 表单)
# ════════════════════════════════════════
settings:
  - key: peers
    type: number
    min: 1
    max: 25
    default: 3
    label:
      zh-CN: "客户端数量"
      en-US: "Number of clients"
    description:
      zh-CN: "VPN 客户端配置文件数量，每个设备用一个"
      en-US: "Number of VPN client configs, one per device"

  - key: dns
    type: string
    default: "1.1.1.1"
    label:
      zh-CN: "DNS 服务器"
      en-US: "DNS Server"
    advanced: true              # 默认隐藏，展开"高级设置"显示

  - key: allowed_ips
    type: string
    default: "0.0.0.0/0"
    label:
      zh-CN: "允许的 IP 范围"
      en-US: "Allowed IPs"
    advanced: true
    description:
      zh-CN: "0.0.0.0/0 = 所有流量走 VPN（全局代理）"
      en-US: "0.0.0.0/0 = route all traffic through VPN"

  - key: internal_subnet
    type: string
    default: "10.13.13.0"
    label:
      zh-CN: "内部子网"
      en-US: "Internal subnet"
    advanced: true

# ════════════════════════════════════════
# 配置映射 — settings 怎么变成 Docker 配置
# ════════════════════════════════════════
config:
  # 方式 A: 环境变量
  env:
    PUID: "1000"
    PGID: "1000"
    TZ: "{{ node.timezone | default 'UTC' }}"
    SERVERURL: "{{ node.public_ip }}"
    SERVERPORT: "51820"
    PEERS: "{{ settings.peers }}"
    PEERDNS: "{{ settings.dns }}"
    ALLOWEDIPS: "{{ settings.allowed_ips }}"
    INTERNAL_SUBNET: "{{ settings.internal_subnet }}"

  # 方式 B: 生成配置文件挂载进容器
  # files:
  #   - target: /etc/hysteria/config.yaml
  #     mode: "0644"
  #     content: |
  #       listen: :443
  #       tls:
  #         cert: /etc/ssl/cert.pem
  #         key: /etc/ssl/key.pem
  #       auth:
  #         type: password
  #         password: {{ settings.password }}

  # 方式 C: 命令行参数 (覆盖 image 的 CMD)
  # args: ["server", "--config", "/etc/app/config.yaml"]

# ════════════════════════════════════════
# 生命周期钩子
# ════════════════════════════════════════
hooks:
  # 部署完成后
  post_deploy:
    - wait_healthy:
        timeout: 60s
        message: "等待 WireGuard 启动..."

  # 配置变更后 (用户在 UI 改了 settings)
  on_config_change:
    # restart    — docker restart (最常用)
    # exec       — 容器内执行命令 (热重载)
    # recreate   — 删除重建容器 (配置变化大时)
    strategy: restart

  # 卸载前
  pre_remove:
    - exec: "echo 'cleaning up'"

# ════════════════════════════════════════
# 客户端配置提取 — 部署完怎么拿到给用户的配置
# ════════════════════════════════════════
clients:
  # ── 模式 A: 每用户一个配置文件 (WireGuard) ──
  type: file_per_user
  source: "/config/peer{n}/peer{n}.conf"
  format: conf                  # conf | json | yaml | txt
  qr: true                     # 配置内容支持生成二维码
  # {n} 从 1 开始，对应 settings.peers 数量
  # Passim 读取文件内容，返回给前端下载/显示 QR

  # ── 模式 B: 凭证式 (L2TP, WebDAV) ──
  # type: credentials
  # fields:
  #   - key: server
  #     label: { zh-CN: "服务器地址", en-US: "Server" }
  #     value: "{{ node.public_ip }}"
  #   - key: username
  #     label: { zh-CN: "用户名", en-US: "Username" }
  #     value: "{{ generated.username }}"
  #   - key: password
  #     label: { zh-CN: "密码", en-US: "Password" }
  #     value: "{{ generated.password }}"
  #     secret: true             # UI 默认隐藏
  #   - key: psk
  #     label: { zh-CN: "预共享密钥", en-US: "PSK" }
  #     value: "{{ generated.psk }}"
  #     secret: true
  #
  # generated 值在 post_deploy 钩子中提取:
  # generated:
  #   username:
  #     method: env
  #     var: VPN_USER
  #   password:
  #     method: exec
  #     command: "cat /etc/vpn/password"
  #   psk:
  #     method: exec
  #     command: "cat /etc/vpn/psk"

  # ── 模式 C: URL 式 (Hysteria, V2Ray, Shadowrocket) ──
  # type: url
  # scheme: "hysteria2://{{ generated.password }}@{{ node.public_ip }}:443/?insecure=1&sni={{ node.domain }}#{{ node.name }}-hysteria"
  # qr: true
  # import_urls:               # 各客户端的导入 URL scheme
  #   stash: "stash://install-config?url={{ urlencode(config_url) }}"
  #   shadowrocket: "shadowrocket://add/{{ base64(url) }}"

# ════════════════════════════════════════
# 用户/客户端管理 — 怎么增删用户 (Phase 2)
# ════════════════════════════════════════
users:
  # 添加用户/客户端
  add:
    method: env_restart
    # env_restart  — 修改 PEERS 数量 +1，重启容器，自动生成新 peer
    # exec         — docker exec 跑命令 (如 htpasswd -b /config/.htpasswd newuser pass)
    # config_edit  — 修改配置文件 (Passim 操作 Go template)，然后 restart

    # exec 方式示例:
    # method: exec
    # command: "htpasswd -b /config/.htpasswd {{ user.name }} {{ user.password }}"
    # post: restart

    # config_edit 方式示例:
    # method: config_edit
    # file: /etc/hysteria/config.yaml
    # action: append_to_list
    # path: "auth.userpass"          # YAML path
    # value: "{{ user.name }}: {{ user.password }}"
    # post: restart

  # 删除用户/客户端
  remove:
    method: env_restart
    # WireGuard: 减少 PEERS 数量 → 但这样会删最后一个
    # 更精确的方式:
    # method: exec
    # command: "rm -rf /config/peer{{ user.index }}"
    # post: restart

  # 列出当前用户/客户端
  list:
    method: glob
    pattern: "/config/peer*/peer*.conf"
    # 返回文件列表，每个文件 = 一个客户端

    # 其他方式:
    # method: exec
    # command: "cat /config/.htpasswd"
    # parser: { type: lines, regex: "^(\\S+):" }

# ════════════════════════════════════════
# 用量追踪 (Phase 2)
# ════════════════════════════════════════
metrics:
  # 整体指标 (所有应用自动有，无需配置)
  # Passim 通过 Docker API 采集: CPU / MEM / NET / DISK

  # 按用户指标 (应用特定)
  per_user:
    method: exec
    command: "wg show wg0 transfer"
    # 输出:
    # peerPubKey1\t123456\t654321
    # peerPubKey2\t789012\t210987
    parser:
      type: tsv                  # tsv | regex | json | jq
      columns: [peer_id, rx_bytes, tx_bytes]

    # 其他 method:
    #
    # method: log
    # container_log: true
    # pattern: 'user=(\S+) transferred=(\d+)'
    # fields: [username, bytes]
    #
    # method: api
    # url: "http://localhost:{{ container.internal_port }}/api/stats"
    # jq: ".users[] | {id: .name, rx: .download, tx: .upload}"
    #
    # method: file
    # path: /config/stats.json
    # jq: ".peers | to_entries[] | {id: .key, rx: .value.rx, tx: .value.tx}"

    # peer_id 到用户的关联
    identity:
      method: file_content
      # 从 peer 配置文件中提取公钥，关联到 peer_id
      source: "/config/peer{n}/publickey-peer{n}"
      # 读取文件内容 = peer public key = wg show 输出的 peer_id

  interval: 60s                  # 采集频率

# ════════════════════════════════════════
# 分享配置 (US-3.5) — Phase 2
# ════════════════════════════════════════
share:
  supports: true                 # 此应用是否支持分享
  per_user: true                 # 每个用户/peer 独立分享 (vs 整个应用共享一个入口)
  share_content:
    - client_config              # 包含客户端配置文件
    - guide                      # 包含使用指南 (guide.platforms)
  # 分享页面自动包含:
  # 1. 配置文件下载 / QR 码
  # 2. 各平台安装指南 (来自 guide.platforms)
  # 3. 限制说明 (来自 limitations)
```

---

## 模板变量

模板中使用 Go template 语法 (`{{ }}`)。Passim 在部署时注入以下变量：

### `node` — 当前节点信息

| 变量 | 说明 | 示例 |
|------|------|------|
| `node.public_ip` | 公网 IPv4 | `203.0.113.10` |
| `node.public_ip6` | 公网 IPv6 (如有) | `2001:db8::1` |
| `node.domain` | 自动域名 | `ywahcia8.dns.passim.io` |
| `node.name` | 节点名称 | `tokyo-1` |
| `node.timezone` | 时区 | `Asia/Tokyo` |
| `node.data_dir` | 数据目录 | `/data/apps/wireguard` |

### `settings` — 用户填写的配置值

来自 `settings` 块定义的字段，用户在 UI 表单中填写。

| 变量 | 说明 |
|------|------|
| `settings.peers` | 用户填的客户端数量 |
| `settings.dns` | 用户填的 DNS 服务器 |
| `settings.*` | 对应 settings 中的 key |

### `generated` — 部署时自动生成的值

| 变量 | 说明 |
|------|------|
| `generated.password` | 随机密码 (16 字符) |
| `generated.username` | 随机用户名 |
| `generated.uuid` | 随机 UUID |
| `generated.port` | 随机可用端口 |

通过 `generated` 块定义生成规则：

```yaml
generated:
  password:
    type: random_string
    length: 16
    charset: alphanumeric
  uuid:
    type: uuid_v4
  port:
    type: random_port
    range: [10000, 60000]
```

### `user` — 用户管理操作中的当前用户

| 变量 | 说明 |
|------|------|
| `user.index` | 用户序号 (1-based) |
| `user.name` | 用户名 |
| `user.password` | 用户密码 |

---

## 配置映射详解

### 方式 A: 环境变量 (`config.env`)

最简单的方式。大多数 linuxserver.io 系列镜像用这种。

```yaml
config:
  env:
    PEERS: "{{ settings.peers }}"
    SERVERURL: "{{ node.public_ip }}"
```

Passim 执行：创建容器时传入 `-e PEERS=3 -e SERVERURL=203.0.113.10`

**适用：** WireGuard, L2TP, 大多数 linuxserver 镜像

### 方式 B: 配置文件 (`config.files`)

生成配置文件，挂载到容器内。

```yaml
config:
  files:
    - target: /etc/hysteria/config.yaml
      mode: "0644"
      content: |
        listen: :443
        tls:
          cert: /data/ssl/cert.pem
          key: /data/ssl/key.pem
        auth:
          type: password
          password: {{ settings.password }}
        masquerade:
          type: proxy
          proxy:
            url: https://www.bing.com
            rewriteHost: true
```

Passim 执行：
1. 渲染 Go template → 生成文件内容
2. 写入 `{node.data_dir}/configs/config.yaml`
3. 创建容器时 bind mount 进去

**适用：** Hysteria 2, V2Ray, Nginx, Caddy, Samba

### 方式 C: 命令行参数 (`config.args`)

覆盖容器的 CMD。

```yaml
config:
  args: ["server", "-c", "/etc/app/config.yaml"]
```

**适用：** 少数需要自定义启动命令的镜像

### 混合使用

一个模板可以同时用多种方式：

```yaml
config:
  env:
    TZ: "{{ node.timezone }}"
    PUID: "1000"
  files:
    - target: /etc/app/config.yaml
      content: |
        ...
  args: ["--config", "/etc/app/config.yaml"]
```

---

## 客户端配置提取详解

部署完成后，用户需要拿到"怎么连接"的信息。不同应用的配置方式差异很大：

### file_per_user — 每用户一个配置文件

```yaml
clients:
  type: file_per_user
  source: "/config/peer{n}/peer{n}.conf"
  format: conf
  qr: true
```

典型应用：WireGuard
- 部署后容器自动在 `/config/peer1/`, `/config/peer2/` 等目录生成配置
- Passim 读取这些文件，提供下载 / QR 码 / 分享

### credentials — 凭证（服务器地址 + 用户名密码）

```yaml
clients:
  type: credentials
  fields:
    - key: server
      label: { zh-CN: "服务器", en-US: "Server" }
      value: "{{ node.public_ip }}"
    - key: username
      label: { zh-CN: "用户名", en-US: "Username" }
      value: "vpnuser"
    - key: password
      label: { zh-CN: "密码", en-US: "Password" }
      value: "{{ generated.password }}"
      secret: true
    - key: psk
      label: { zh-CN: "预共享密钥", en-US: "PSK" }
      value: "{{ generated.psk }}"
      secret: true
  # iOS 额外支持
  mobileconfig:
    template: l2tp.mobileconfig.tmpl
```

典型应用：L2TP/IPSec, WebDAV
- 没有配置文件，而是一组凭证
- UI 显示为可复制的字段列表
- iOS 可以额外生成 .mobileconfig 描述文件

### url — URL 式配置

```yaml
clients:
  type: url
  urls:
    - name: "Hysteria 2"
      scheme: "hysteria2://{{ generated.password }}@{{ node.public_ip }}:443/?insecure=1&sni={{ node.domain }}#{{ node.name }}"
      qr: true
  import_urls:
    stash: "stash://install-config?url={{ urlencode(subscribe_url) }}"
    shadowrocket: "sub://{{ base64(subscribe_url) }}"
```

典型应用：Hysteria 2, V2Ray, Shadowsocks
- 配置就是一个 URL
- 支持生成 QR 码
- 支持各客户端的 import URL scheme（一键导入 Stash/Shadowrocket 等）

---

## 用户管理详解 — Phase 2

### env_restart — 修改环境变量，重启容器

```yaml
users:
  add:
    method: env_restart
    env_key: PEERS              # 修改哪个环境变量
    action: increment           # increment (数量+1) | append (追加值)
  remove:
    method: env_restart
    env_key: PEERS
    action: decrement
```

最简单但最粗糙——WireGuard 改 PEERS 数量后重启，容器自动生成/删除 peer。
缺点：删除是从最后一个开始删，不能精确删某个。

### exec — 容器内执行命令

```yaml
users:
  add:
    method: exec
    command: "htpasswd -b /config/.htpasswd {{ user.name }} {{ user.password }}"
    post: reload               # reload | restart | none
  remove:
    method: exec
    command: "htpasswd -D /config/.htpasswd {{ user.name }}"
    post: reload
  list:
    method: exec
    command: "cat /config/.htpasswd | cut -d: -f1"
    parser: { type: lines }
```

适用：WebDAV, Samba, 任何用 htpasswd/配置文件管理用户的应用。

### config_edit — Passim 直接编辑配置文件

```yaml
users:
  add:
    method: config_edit
    file: /etc/hysteria/config.yaml
    format: yaml
    operation: set
    path: "auth.userpass.{{ user.name }}"
    value: "{{ user.password }}"
    post: restart
  remove:
    method: config_edit
    file: /etc/hysteria/config.yaml
    format: yaml
    operation: delete
    path: "auth.userpass.{{ user.name }}"
    post: restart
```

适用：Hysteria 2, V2Ray 等使用 YAML/JSON 配置的应用。
Passim 直接解析配置文件，修改指定路径，写回，然后重启容器。

---

## 用量追踪详解 — Phase 2

### exec — 执行命令获取统计

```yaml
metrics:
  per_user:
    method: exec
    command: "wg show wg0 transfer"
    parser:
      type: tsv
      columns: [peer_id, rx_bytes, tx_bytes]
    identity:
      method: file_content
      source: "/config/peer{n}/publickey-peer{n}"
```

WireGuard 的 `wg show wg0 transfer` 输出每个 peer 的流量，但用 public key 标识。
`identity` 块告诉 Passim 怎么把 public key 关联到用户序号。

### api — 应用自带 HTTP API

```yaml
metrics:
  per_user:
    method: api
    url: "http://localhost:9090/api/traffic"
    jq: ".users | to_entries[] | {id: .key, rx: .value.download, tx: .value.upload}"
```

V2Ray、Hysteria 2 等有内置统计 API 的应用。

### log — 解析容器日志

```yaml
metrics:
  per_user:
    method: log
    pattern: 'client="(\S+)" bytes_sent=(\d+) bytes_received=(\d+)'
    fields: [username, tx_bytes, rx_bytes]
    window: 5m                   # 只分析最近 5 分钟的日志
```

适用于没有统计 API、但会把访问信息写到日志的应用（如 WebDAV 的 access log）。

### file — 读取统计文件

```yaml
metrics:
  per_user:
    method: file
    path: /config/stats.json
    jq: ".peers | to_entries[] | {id: .key, rx: .value.rx, tx: .value.tx}"
```

某些应用会把统计写到文件里。

### 聚合与存储

Passim 按 `metrics.interval`（默认 60s）定期采集，结果存入 SQLite：

```sql
CREATE TABLE app_metrics (
  app_id     TEXT,
  user_id    TEXT,       -- peer_id / username
  rx_bytes   INTEGER,
  tx_bytes   INTEGER,
  timestamp  DATETIME
);
```

前端展示时聚合为：
- 实时速率（最近两次采样的差值 / 间隔）
- 今日流量、本月流量
- 每用户流量排行（共享管理页面 US-8.1 使用）

---

## 完整模板示例

### WireGuard (env + file_per_user)

```yaml
name: wireguard
version: 1.0.0
category: vpn
icon: shield

description:
  zh-CN: "快速安全的点对点 VPN"
  en-US: "Fast and secure point-to-point VPN"

source:
  url: "https://github.com/linuxserver/docker-wireguard"
  license: GPL-2.0

container:
  image: linuxserver/wireguard:latest
  ports:
    - { host: 51820, container: 51820, protocol: udp }
  volumes:
    - { name: config, path: /config }
    - { host: /lib/modules, path: /lib/modules, readonly: true }
  cap_add: [NET_ADMIN, SYS_MODULE]
  sysctls:
    net.ipv4.conf.all.src_valid_mark: 1

settings:
  - { key: peers, type: number, min: 1, max: 25, default: 3,
      label: { zh-CN: "客户端数量", en-US: "Clients" } }
  - { key: dns, type: string, default: "1.1.1.1", advanced: true,
      label: { zh-CN: "DNS", en-US: "DNS" } }

config:
  env:
    PUID: "1000"
    PGID: "1000"
    TZ: "{{ node.timezone }}"
    SERVERURL: "{{ node.public_ip }}"
    SERVERPORT: "51820"
    PEERS: "{{ settings.peers }}"
    PEERDNS: "{{ settings.dns }}"

hooks:
  post_deploy:
    - wait_healthy: { timeout: 60s }
  on_config_change:
    strategy: restart

clients:
  type: file_per_user
  source: "/config/peer{n}/peer{n}.conf"
  format: conf
  qr: true

users:
  add: { method: env_restart, env_key: PEERS, action: increment }
  remove: { method: env_restart, env_key: PEERS, action: decrement }
  list: { method: glob, pattern: "/config/peer*/peer*.conf" }

metrics:
  per_user:
    method: exec
    command: "wg show wg0 transfer"
    parser: { type: tsv, columns: [peer_id, rx_bytes, tx_bytes] }
    identity: { method: file_content, source: "/config/peer{n}/publickey-peer{n}" }
  interval: 60s

share:
  supports: true
  per_user: true
  share_content: [client_config, guide]

guide:
  platforms:
    - name: iOS
      store_url: "https://apps.apple.com/app/wireguard/id1441195209"
      steps: ["安装 WireGuard App", "扫描二维码或导入 .conf 文件"]
    - name: Android
      store_url: "https://play.google.com/store/apps/details?id=com.wireguard.android"
      steps: ["安装 WireGuard App", "点击 + → 从文件导入"]

limitations:
  - "需要安装 WireGuard 客户端"
  - "使用 UDP 协议，部分网络可能受限"
```

### Hysteria 2 (files + url + config_edit)

```yaml
name: hysteria2
version: 1.0.0
category: proxy
icon: zap

description:
  zh-CN: "基于 QUIC 的高速代理"
  en-US: "High-speed proxy based on QUIC"

source:
  url: "https://github.com/apernet/hysteria"
  license: MIT

container:
  image: tobyxdd/hysteria:v2
  ports:
    - { host: 443, container: 443, protocol: udp }
  volumes:
    - { name: config, path: /etc/hysteria }

settings:
  - { key: password, type: password, default: "{{ generated.password }}",
      label: { zh-CN: "连接密码", en-US: "Password" } }
  - { key: masquerade_url, type: string, default: "https://www.bing.com", advanced: true,
      label: { zh-CN: "伪装网站", en-US: "Masquerade URL" } }

generated:
  password: { type: random_string, length: 16 }

config:
  files:
    - target: /etc/hysteria/config.yaml
      content: |
        listen: :443
        tls:
          cert: {{ node.data_dir }}/ssl/cert.pem
          key: {{ node.data_dir }}/ssl/key.pem
        auth:
          type: userpass
          userpass: {}
        masquerade:
          type: proxy
          proxy:
            url: {{ settings.masquerade_url }}
            rewriteHost: true
  args: ["server", "-c", "/etc/hysteria/config.yaml"]

hooks:
  post_deploy:
    - wait_healthy: { timeout: 30s }
  on_config_change:
    strategy: restart

clients:
  type: url
  urls:
    - name: "Hysteria 2"
      scheme: "hysteria2://{{ user.name }}:{{ user.password }}@{{ node.public_ip }}:443/?insecure=0&sni={{ node.domain }}#{{ node.name }}"
      qr: true
  import_urls:
    stash: "stash://install-config?url={{ urlencode(subscribe_url) }}"
    shadowrocket: "sub://{{ base64(subscribe_url) }}"

users:
  add:
    method: config_edit
    file: /etc/hysteria/config.yaml
    format: yaml
    operation: set
    path: "auth.userpass.{{ user.name }}"
    value: "{{ user.password }}"
    post: restart
  remove:
    method: config_edit
    file: /etc/hysteria/config.yaml
    format: yaml
    operation: delete
    path: "auth.userpass.{{ user.name }}"
    post: restart
  list:
    method: config_read
    file: /etc/hysteria/config.yaml
    format: yaml
    path: "auth.userpass"
    parser: { type: keys }

metrics:
  per_user:
    method: api
    url: "http://localhost:25565/traffic"
    jq: ".[] | {id: .user, rx: .rx, tx: .tx}"
  interval: 60s

share:
  supports: true
  per_user: true
  share_content: [client_config, guide]

guide:
  platforms:
    - name: iOS
      steps: ["安装 Stash 或 Shadowrocket", "扫描二维码一键导入"]
    - name: Android
      steps: ["安装 NekoBox 或 Clash Meta", "扫描二维码或复制链接导入"]
    - name: Windows
      steps: ["下载 Clash Verge", "复制订阅链接导入"]

limitations:
  - "需要安装第三方代理客户端"
  - "443 端口与 HTTPS 共用时需要额外配置"
```

### WebDAV (env + exec 用户管理)

```yaml
name: webdav
version: 1.0.0
category: storage
icon: folder

description:
  zh-CN: "个人网盘，支持 WebDAV 协议"
  en-US: "Personal cloud storage with WebDAV"

source:
  url: "https://github.com/hacdias/webdav"
  license: MIT

container:
  image: hacdias/webdav:latest
  ports:
    - { host: 8080, container: 8080, protocol: tcp }
  volumes:
    - { name: data, path: /data, description: "文件存储" }
    - { name: config, path: /config }

settings:
  - { key: username, type: string, default: "admin",
      label: { zh-CN: "管理员用户名", en-US: "Admin username" } }
  - { key: password, type: password, default: "{{ generated.password }}",
      label: { zh-CN: "管理员密码", en-US: "Admin password" } }

generated:
  password: { type: random_string, length: 12 }

config:
  files:
    - target: /config/config.yaml
      content: |
        address: 0.0.0.0
        port: 8080
        auth: true
        users:
          - username: {{ settings.username }}
            password: {{ settings.password }}
            scope: /data
  args: ["--config", "/config/config.yaml"]

clients:
  type: credentials
  fields:
    - { key: url, label: { zh-CN: "WebDAV 地址", en-US: "WebDAV URL" },
        value: "https://{{ node.domain }}:8080" }
    - { key: username, label: { zh-CN: "用户名", en-US: "Username" },
        value: "{{ settings.username }}" }
    - { key: password, label: { zh-CN: "密码", en-US: "Password" },
        value: "{{ settings.password }}", secret: true }

users:
  add:
    method: config_edit
    file: /config/config.yaml
    format: yaml
    operation: append_to_list
    path: "users"
    value:
      username: "{{ user.name }}"
      password: "{{ user.password }}"
      scope: "/data/{{ user.name }}"
    post: restart
  remove:
    method: config_edit
    file: /config/config.yaml
    format: yaml
    operation: remove_from_list
    path: "users"
    match: { username: "{{ user.name }}" }
    post: restart
  list:
    method: config_read
    file: /config/config.yaml
    format: yaml
    path: "users"
    parser: { type: list, field: username }

metrics:
  per_user:
    method: exec
    command: "du -sb /data/*/ | sort -rn"
    parser:
      type: tsv
      columns: [bytes, path]
      # path → 用户名: /data/alice/ → alice
  interval: 300s                 # 存储类不用太频繁

share:
  supports: true
  per_user: true
  share_content: [client_config, guide]

guide:
  platforms:
    - name: iOS
      steps: ["打开「文件」App", "点击右上角 ⋯ → 连接服务器", "输入 WebDAV 地址"]
    - name: Android
      steps: ["安装 Solid Explorer 或 CX 文件管理器", "添加 WebDAV 连接"]
    - name: Windows
      steps: ["打开文件管理器", "右键「此电脑」→ 映射网络驱动器", "输入 WebDAV 地址"]
    - name: macOS
      steps: ["Finder → 前往 → 连接服务器", "输入 WebDAV 地址"]
```

---

## 模板引擎实现 ✅ Phase 1

### Passim 侧处理流程 (已实现)

```
用户点击 [部署] → POST /api/apps { template: "wireguard", settings: { peers: 5 } }
    │
    ▼
[1] 加载模板 YAML
    │
    ▼
[2] 校验 settings (类型/范围/必填)
    │
    ▼
[3] 生成 generated 值 (密码/UUID/端口)
    │
    ▼
[4] 渲染模板变量 (Go template)
    ├── config.env → 渲染环境变量
    ├── config.files → 渲染配置文件内容 → 写入 data_dir
    └── config.args → 渲染命令行参数
    │
    ▼
[5] 创建 Docker 容器
    ├── Image: container.image
    ├── Env: 渲染后的 config.env
    ├── Ports: container.ports
    ├── Volumes: container.volumes + config.files 的 bind mount
    ├── CapAdd: container.cap_add
    ├── Sysctls: container.sysctls
    ├── Cmd: config.args (如有)
    ├── Labels: { "io.passim.app": name, "io.passim.template": version }
    └── RestartPolicy: container.restart
    │
    ▼
[6] 启动容器
    │
    ▼
[7] 执行 hooks.post_deploy
    ├── wait_healthy → 轮询 healthcheck 直到成功或超时
    └── exec → docker exec 执行命令
    │
    ▼
[8] 保存部署信息到 SQLite
    {
      app_id, template_name, template_version,
      settings (JSON), generated (JSON),
      container_id, node_id, deployed_at
    }
    │
    ▼
[9] 返回成功 + 开始 metrics 采集定时任务
```

### 配置变更流程 — Phase 2

> Phase 1 仅实现了 `PATCH /api/apps/:id` 更新 settings 到数据库，不会重新渲染配置或重启容器。

```
用户修改 settings → PATCH /api/apps/:id { "settings": { "peers": 8 } }
    │
    ▼
[1] 校验新 settings
    │
    ▼
[2] 重新渲染配置
    ├── config.env → 更新容器环境变量
    ├── config.files → 重写配置文件
    └── config.args → 更新启动命令
    │
    ▼
[3] 根据 hooks.on_config_change.strategy 执行
    ├── restart → docker restart
    ├── exec → docker exec <command> (热重载)
    └── recreate → docker rm + docker create + docker start
    │
    ▼
[4] 更新 SQLite 中的 settings
```

### 用户增删流程 — Phase 2

```
管理员添加用户 → POST /api/apps/:id/users { name: "alice", password: "xxx" }
    │
    ▼
[1] 根据 users.add.method 执行
    ├── env_restart → 修改 PEERS 环境变量 → docker restart
    ├── exec → docker exec <command>
    └── config_edit → 读取配置文件 → 修改 → 写回 → post action
    │
    ▼
[2] 如果 users.add.post = restart → docker restart
    │
    ▼
[3] 保存用户信息到 SQLite app_users 表
    │
    ▼
[4] 返回新用户的客户端配置 (clients 模板渲染)
```
