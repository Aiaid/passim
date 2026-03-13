# Epic 11: 云服务商直连

> Phase: 5+ | 依赖: Epic 10 (手机 App)

普通用户最大的门槛不是"怎么用 Passim"，而是"怎么买 VPS"。这个 Epic 让用户在 App 里直接完成从购买 VPS 到 Passim 自动部署的全流程——输入云厂商 API Key → 选区域 → 选配置 → 一键开机 → 自动安装 → 直接用。

**架构决策: 云账号 + 能力发现**

云账号是基础连接层。绑定一个云账号后，App 自动发现该账号支持的能力 (capability)，用户可以按需调用：

```
连接云账号 (一次绑定 API Key)
  │
  └── 自动发现该账号的能力
        ├── compute   (VPS)         → 购买/管理 VPS，部署 Passim
        ├── storage   (S3 兼容)     → 开通对象存储，挂载网盘/备份
        ├── tunnel    (隧道)        → Cloudflare Tunnel 暴露 Passim 到公网
        ├── dns                     → Cloudflare DNS / 域名管理
        └── (未来扩展) cdn / serverless / ...
```

App 端通过 `fetch` 直接调用各云厂商 REST API，不经过任何中间服务器。用户的云 API Key 只存储在手机的 SecureStore (加密) 中，不上传到任何地方。

**厂商与能力矩阵:**

| 厂商 | compute | storage | tunnel | dns |
|------|---------|---------|--------|-----|
| Vultr | VPS | Object Storage | - | - |
| DigitalOcean | Droplet | Spaces | - | - |
| Hetzner | Server | Object Storage | - | - |
| AWS Lightsail | Instance | Bucket / S3 | - | - |
| Linode (Akamai) | Linode | Object Storage | - | - |
| Cloudflare | - | R2 (免出站费) | Tunnel / WARP | DNS |

**优先级:**
- 第一批: Vultr / DigitalOcean / Hetzner / AWS Lightsail / Linode (compute + storage)
- 第一批: Cloudflare (storage + tunnel + dns)
- 第二批: AWS EC2 / GCP / Azure (compute API 复杂，后续加)

---

## US-11.1 绑定云服务商账号 `P1` `Phase 5+`

**作为** 新用户
**我想** 在 App 里添加我的云服务商 API Key
**以便** 后续可以使用该厂商提供的各种服务 (VPS / 存储 / 隧道等)

**验收标准:**
- [ ] 设置 → 云账号管理，可添加多个云厂商账号
- [ ] 支持的厂商及认证方式:
  | 厂商 | 认证 | 可用能力 |
  |------|------|---------|
  | Vultr | `Bearer` Token | compute, storage |
  | DigitalOcean | `Bearer` Token | compute, storage |
  | Hetzner Cloud | `Bearer` Token (per-project) | compute, storage |
  | AWS Lightsail | Access Key + Secret Key | compute, storage |
  | Linode (Akamai) | `Bearer` Token (PAT) | compute, storage |
  | Cloudflare | `Bearer` API Token + Account ID | storage, tunnel, dns |
- [ ] 添加后立即验证 API Key 有效性 (调用账号信息接口)
- [ ] 验证成功后**自动发现可用能力**，显示:
  - 账户信息 (邮箱/余额)
  - 可用服务列表及图标 (如: "服务器 · 存储" 或 "存储 · 隧道 · 域名")
- [ ] 验证失败显示人话错误: "密钥无效" / "权限不足，需要 xxx 权限"
- [ ] API Key 存储在 SecureStore (加密)，不上传到任何服务器
- [ ] 每个厂商可以存多个账号 (命名区分)
- [ ] 可以删除已绑定的账号 (二次确认)

**安全设计:**
- API Key 仅存储在设备本地 SecureStore
- 网络请求直接从 App 发到云厂商 API，不经过任何代理
- 敏感信息在内存中使用后清除
- App 锁 (生物认证) 保护入口

**前端交互:**
```
设置 → 云账号
┌──────────────────────────────────┐
│ 云账号管理                        │
│                                  │
│ ┌─ Vultr ──────────────────────┐ │
│ │ 🟢 my-vultr  ·  $23.50 余额  │ │
│ │    服务器 · 存储              │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌─ Cloudflare ─────────────────┐ │
│ │ 🟢 cf-main                   │ │
│ │    存储 · 隧道 · 域名         │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌─ DigitalOcean ───────────────┐ │
│ │ 🟢 do-main  ·  me@email.com  │ │
│ │    服务器 · 存储              │ │
│ └──────────────────────────────┘ │
│                                  │
│         [+ 添加云账号]            │
└──────────────────────────────────┘
```

---

## US-11.2 浏览 VPS 配置和价格 `P1` `Phase 5+`

**作为** 用户
**我想** 在购买前看到各区域的 VPS 配置和价格
**以便** 选择最合适的方案

**验收标准:**
- [ ] 选择云账号后，自动拉取可用区域列表
- [ ] 区域列表按地理位置分组 (亚太 / 美洲 / 欧洲)，标注国旗
- [ ] 选择区域后展示可用套餐:
  - 规格: CPU / 内存 / 磁盘 / 流量
  - 价格: 月费 + 时费 (如果支持)
- [ ] 智能推荐: 默认高亮"最适合 Passim"的套餐 (1C/1G 或 1C/2G，最便宜的够用套餐)
- [ ] 跨厂商比价: 如果绑定了多个厂商，可以看同区域不同厂商的价格对比
- [ ] 显示各厂商的定价币种 (USD)

**数据来源 (App 直连):**
```
Vultr:        GET https://api.vultr.com/v2/regions
              GET https://api.vultr.com/v2/plans
DigitalOcean: GET https://api.digitalocean.com/v2/regions
              GET https://api.digitalocean.com/v2/sizes
Hetzner:      GET https://api.hetzner.cloud/v1/locations
              GET https://api.hetzner.cloud/v1/server_types
Lightsail:    POST https://lightsail.{region}.amazonaws.com/
              (GetRegions / GetBundles)
Linode:       GET https://api.linode.com/v4/regions
              GET https://api.linode.com/v4/linode/types
```

**前端交互:**
```
创建 VPS → 选区域
┌──────────────────────────────────┐
│ 选择区域                          │
│                                  │
│ 🌏 亚太                          │
│  🇯🇵 东京    ·  延迟 45ms         │
│  🇸🇬 新加坡  ·  延迟 72ms         │
│  🇰🇷 首尔    ·  延迟 60ms         │
│                                  │
│ 🌎 美洲                          │
│  🇺🇸 洛杉矶  ·  延迟 150ms        │
│  🇺🇸 纽约    ·  延迟 200ms        │
│                                  │
│ 🌍 欧洲                          │
│  🇩🇪 法兰克福 ·  延迟 180ms       │
│  🇳🇱 阿姆斯特丹 · 延迟 190ms     │
└──────────────────────────────────┘

选区域后 → 选套餐
┌──────────────────────────────────┐
│ 🇯🇵 东京 · Vultr                 │
│                                  │
│ ⭐ 推荐                          │
│ ┌──────────────────────────────┐ │
│ │ 1 CPU · 1 GB · 25 GB SSD    │ │
│ │ 1 TB 流量                    │ │
│ │ $6/月 ($0.009/时)            │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ 1 CPU · 2 GB · 50 GB SSD    │ │
│ │ 2 TB 流量                    │ │
│ │ $12/月                       │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ 2 CPU · 4 GB · 80 GB SSD    │ │
│ │ 3 TB 流量                    │ │
│ │ $24/月                       │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

---

## US-11.3 一键购买 VPS 并部署 Passim `P0` `Phase 5+`

**作为** 用户
**我想** 选好配置后一键完成"购买 VPS + 安装 Passim"
**以便** 不需要碰终端就能开始使用

**验收标准:**
- [ ] 确认页面显示: 厂商 / 区域 / 配置 / 价格 / 预计等待时间
- [ ] 用户确认后，App 调用云 API 创建实例:
  - OS 镜像: Ubuntu 24.04 LTS (各厂商通用)
  - 通过 `user_data` (cloud-init) 自动安装 Docker + 部署 Passim
  - 自动开放端口 8443 + 80 (通过防火墙组/安全组 API)
- [ ] 进度展示 (全屏进度页):
  ```
  ✅ 创建实例        (10s)
  ✅ 等待启动        (30-60s)
  ⏳ 安装 Passim     (60-90s)
  ○ 验证连接
  ○ 完成
  ```
- [ ] 安装完成后自动连接:
  - cloud-init 脚本中生成 API Key，写入实例 metadata/tag
  - App 从 metadata/tag 读取 API Key
  - 自动调用 `POST /api/auth/login` 完成连接
- [ ] 失败处理:
  - 创建失败 → 显示原因 (余额不足 / 配额限制 / 区域不可用)
  - 安装超时 → 提供"重试安装"和"SSH 手动排查"选项
  - 连接失败 → 提供手动输入 API Key 的回退方式

**cloud-init 脚本:**
```yaml
#cloud-config
package_update: true
packages:
  - docker.io
  - curl
runcmd:
  - systemctl enable docker
  - systemctl start docker
  - |
    API_KEY=$(openssl rand -hex 24)
    docker run -d \
      --name passim \
      --restart always \
      -e PASSIM_API_KEY=$API_KEY \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v passim-data:/data \
      -p 8443:8443 \
      -p 80:80 \
      passim/passim:latest
    # 写入 metadata 供 App 读取
    # (各厂商方式不同，见 provider adapter)
```

**API Key 回传机制 (按厂商):**

| 厂商 | 回传方式 | 读取方式 |
|------|---------|---------|
| Vultr | Instance tag | `GET /v2/instances/{id}` → tags |
| DigitalOcean | Droplet tag | `GET /v2/droplets/{id}` → tags |
| Hetzner | Server label | `GET /v1/servers/{id}` → labels |
| Lightsail | Instance tag | `GetInstanceTag` |

**备选回传方式 (通用):** cloud-init 完成后向一个 App 注册的临时 webhook 推送，或 App 直接尝试连接 `https://{ip}:8443` 并用生成的 API Key 登录。

**安全考虑:**
- API Key 通过 instance tag/label 传递，只有持有云 API Key 的人能读取
- cloud-init 脚本中 API Key 是随机生成的，不硬编码
- 连接成功后建议用户立即注册 Passkey 作为日常登录方式

---

## US-11.4 查看云端 VPS 状态 `P1` `Phase 5+`

**作为** 用户
**我想** 在 App 里看到我通过云 API 创建的 VPS 的云端状态
**以便** 了解计费和资源使用情况

**验收标准:**
- [ ] 节点详情页新增"云信息"卡片 (仅云端创建的节点):
  - 厂商 + 区域 + 配置
  - 月费 / 已用金额 (如果 API 提供)
  - 公网 IP / IPv6
  - 创建时间
- [ ] 云端操作:
  - 关机 / 开机 (cloud API power off/on)
  - 重启 (cloud API reboot)
  - 销毁 (二次确认 + 输入节点名称确认)
- [ ] 销毁时警告: "这将永久删除 VPS 及其所有数据，此操作不可撤销"
- [ ] 销毁完成后从节点列表移除

**数据存储 (App 本地):**
```typescript
// SecureStore 中 node 扩展字段
{
  "id": "uuid",
  "host": "149.28.xx.xx:8443",
  "token": "eyJ...",
  "name": "tokyo-1",
  // 云端信息
  "cloud": {
    "provider": "vultr",
    "accountId": "my-vultr",    // 关联 US-11.1 的账号
    "instanceId": "cb676a46-...",
    "region": "nrt",
    "plan": "vc2-1c-1gb",
    "ip": "149.28.xx.xx",
    "monthlyPrice": 6.00,
    "createdAt": "2026-03-13T..."
  }
}
```

---

## US-11.5 一键开通云存储 (S3) `P2` `Phase 5+`

**作为** 用户
**我想** 在 App 里一键开通云存储
**以便** 给 Passim 挂载网盘/备份空间，不需要搞懂"对象存储"是什么

**验收标准:**
- [ ] 入口: 存储管理 → "开通云存储"
- [ ] 支持的 S3 兼容存储:
  | 厂商 | 产品 | S3 端点 | 特点 |
  |------|------|---------|------|
  | Vultr | Object Storage | `{region}.vultrobjects.com` | 与 VPS 同账号，专用 API 创建 |
  | DigitalOcean | Spaces | `{region}.digitaloceanspaces.com` | 与 Droplet 同账号，S3 协议创建 |
  | Hetzner | Object Storage | `{location}.your-objectstorage.com` | S3 协议创建 |
  | Linode | Object Storage | `{region}.linodeobjects.com` | 与 VPS 同账号，专用 API 创建 |
  | Cloudflare | R2 | `{account_id}.r2.cloudflarestorage.com` | **免出站流量费**，适合大量下载场景 |
  | AWS | S3 / Lightsail Buckets | `{bucket}.s3.{region}.amazonaws.com` | Lightsail 有专用 Bucket API |
  | Backblaze | B2 | `s3.{region}.backblazeb2.com` | 最便宜 |
- [ ] 向导流程:
  1. 选择厂商 (优先推荐已绑定账号的厂商)
  2. 选区域 (推荐与 VPS 同区域)
  3. 输入 Bucket 名称 (或自动生成)
  4. 确认 → 创建
- [ ] 创建成功后自动生成 S3 凭证，保存到 Passim 节点:
  - `POST /api/s3` → 将 endpoint/bucket/access_key/secret_key 写入 Passim
- [ ] 对用户展示: "你的云存储已开通，可以在 WebDAV 应用中使用了"

---

## US-11.6 Cloudflare Tunnel 接入 `P2` `Phase 5+`

**作为** 用户
**我想** 用 Cloudflare Tunnel 把 Passim 暴露到公网
**以便** 不需要开放端口、不需要公网 IP，也能随时访问我的 Passim

**背景:**

Cloudflare Tunnel (原 Argo Tunnel) 可以在 VPS 内部运行 `cloudflared`，建立到 Cloudflare 边缘网络的出站隧道。这意味着:
- 不需要在防火墙开放 8443/80 端口
- 不需要公网 IP (NAT 后面也能用)
- 自动 HTTPS (Cloudflare 边缘终止 TLS)
- DDoS 防护免费附带

**验收标准:**
- [ ] 前提: 已绑定有 `tunnel` 能力的 Cloudflare 账号
- [ ] 入口: 节点设置 → 网络 → "通过 Cloudflare Tunnel 访问"
- [ ] 配置向导:
  1. 选择 Cloudflare 账号
  2. 选择域名 (如果有 `dns` 能力，从已有 zone 列表中选) 或使用 `*.cfargotunnel.com` 临时域名
  3. 确认 → 创建 Tunnel → 获取 token
  4. 在 Passim 节点上部署 `cloudflared` 容器 (通过 Passim API)
- [ ] 部署 cloudflared 容器:
  ```yaml
  # 通过 Passim 应用模板部署
  container:
    image: cloudflare/cloudflared:latest
    command: ["tunnel", "--no-autoupdate", "run", "--token", "{{settings.tunnel_token}}"]
    network_mode: host      # 或 bridge + link to passim
  ```
- [ ] 部署成功后:
  - 显示公网访问地址 (如 `passim.example.com`)
  - 验证隧道连通性 (访问公网地址检测 Passim 响应)
- [ ] 可以停止/删除隧道 (同时清理 cloudflared 容器和 Cloudflare 侧资源)

**Cloudflare API:**
```
创建隧道:  POST https://api.cloudflare.com/client/v4/accounts/{id}/cfd_tunnel
           Body: { "name": "passim-tokyo", "tunnel_secret": "<base64>" }
           → 返回 tunnel_id + token

配置路由:  PUT  https://api.cloudflare.com/client/v4/accounts/{id}/cfd_tunnel/{tunnel_id}/configurations
           Body: { "config": { "ingress": [
             { "hostname": "passim.example.com", "service": "https://localhost:8443" },
             { "service": "http_status:404" }
           ]}}

绑定 DNS:  POST https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records
           Body: { "type": "CNAME", "name": "passim", "content": "{tunnel_id}.cfargotunnel.com", "proxied": true }

删除隧道:  DELETE https://api.cloudflare.com/client/v4/accounts/{id}/cfd_tunnel/{tunnel_id}
```

**用户看到的措辞:**
- "开启安全通道" (不说"创建 Tunnel")
- "你的服务器现在可以通过 passim.example.com 安全访问了" (不说"Tunnel 已建立")
- "关闭通道" (不说"删除 Tunnel")

---

## US-11.7 云服务向导 (新手全引导) `P1` `Phase 5+`

**作为** 完全没有 VPS 的新用户
**我想** 打开 App 就能一步步引导我完成所有设置
**以便** 从零开始到可用只需要几分钟

**验收标准:**
- [ ] 首次打开 App → 引导页新增路径:
  ```
  "我需要一台服务器"
    → 注册云账号引导 (如果还没有)
    → 绑定 API Key (US-11.1)
    → 推荐区域和配置 (US-11.2)
    → 一键购买部署 (US-11.3)
    → 自动连接
    → 引导部署第一个 VPN (→ US-3.3)
    → (可选) 用 Cloudflare Tunnel 开启安全通道 (→ US-11.6)
  ```
- [ ] 全程人话引导，不出现"API Key"、"实例"、"cloud-init"等技术词汇
- [ ] 用户看到的措辞示例:
  - "选一个离你最近的服务器位置" (不说"选区域")
  - "每月 $6，随时可以取消" (不说"按需计费")
  - "正在给你的服务器装管家..." (不说"部署 Passim 容器")
  - "搞定了！现在装个 VPN 吧" (不说"部署 WireGuard 应用")

---

## 技术实现: Provider Adapter

App 端需要一个统一的云厂商适配层，屏蔽各厂商 API 差异。

### 各厂商 API 对照表

#### VPS 厂商 (5 家)

| 维度 | Vultr | DigitalOcean | Hetzner | Lightsail | Linode |
|------|-------|-------------|---------|-----------|--------|
| **Base URL** | `api.vultr.com/v2` | `api.digitalocean.com/v2` | `api.hetzner.cloud/v1` | `lightsail.{region}.amazonaws.com` | `api.linode.com/v4` |
| **认证** | `Bearer {key}` | `Bearer {token}` | `Bearer {token}` | AWS Signature V4 | `Bearer {PAT}` |
| **HTTP 风格** | RESTful | RESTful | RESTful | 全部 POST (JSON-RPC) | RESTful |
| **列区域** | `GET /regions` | `GET /regions` | `GET /locations` | `POST → GetRegions` | `GET /regions` |
| **列套餐** | `GET /plans?type=vc2` | `GET /sizes` | `GET /server_types` | `POST → GetBundles` | `GET /linode/types` |
| **创建实例** | `POST /instances` | `POST /droplets` | `POST /servers` | `POST → CreateInstances` | `POST /linode/instances` |
| **获取实例** | `GET /instances/{uuid}` | `GET /droplets/{int}` | `GET /servers/{int}` | `POST → GetInstance` (name) | `GET /linode/instances/{int}` |
| **删除实例** | `DELETE …/{uuid}` → 204 | `DELETE …/{int}` → 204 | `DELETE …/{int}` → 200 | `POST → DeleteInstance` | `DELETE …/{int}` → 200 |
| **user_data 编码** | **Base64** | 明文 | 明文 (≤32KB) | 明文 | **Base64** (在 `metadata.user_data`) |
| **user_data 字段** | `user_data` | `user_data` | `user_data` | `userData` | `metadata.user_data` |
| **实例 ID 类型** | UUID string | Integer | Integer | **Name string** | Integer |
| **标签** | `tags` (string[]) | `tags` (string[]) | `labels` (kv map) | `tags` (kv[]) | `tags` (string[]) |
| **OS 镜像** | `os_id: 1743` | `"ubuntu-24-04-x64"` | `"ubuntu-24.04"` | `"ubuntu_24_04"` | `"linode/ubuntu24.04"` |
| **分页** | Cursor | Page/per_page | Page/per_page | Token | Page/page_size |

#### 对象存储 (6 家，含仅存储厂商)

| 维度 | Vultr | DigitalOcean | Hetzner | Lightsail | Linode | Cloudflare R2 |
|------|-------|-------------|---------|-----------|--------|--------------|
| **创建方式** | 专用 API | S3 协议 | S3 协议 | 专用 API | 专用 API | 专用 API |
| **创建端点** | `POST /object-storage` | `PUT /{bucket}` (S3) | `PUT /{bucket}` (S3) | `→ CreateBucket` | `POST /object-storage/buckets` | `POST /accounts/{id}/r2/buckets` |
| **S3 端点** | `{region}.vultrobjects.com` | `{region}.digitaloceanspaces.com` | `{location}.your-objectstorage.com` | `{bucket}.s3.{region}.amazonaws.com` | `{region}.linodeobjects.com` | `{account_id}.r2.cloudflarestorage.com` |
| **凭证获取** | 创建时返回 | Dashboard 生成 | API/Dashboard | `→ CreateBucketAccessKey` | `POST /object-storage/keys` | Dashboard 或临时凭证 API |
| **免出站费** | 否 | 否 | 否 | 否 | 否 | **是** |

### 创建实例请求体示例

**Vultr:**
```json
{
  "region": "nrt",
  "plan": "vc2-1c-1gb",
  "os_id": 1743,
  "user_data": "<base64 编码的 cloud-init>",
  "label": "passim-tokyo",
  "tags": ["passim"],
  "enable_ipv6": true
}
```

**DigitalOcean:**
```json
{
  "name": "passim-nyc",
  "region": "nyc1",
  "size": "s-1vcpu-1gb",
  "image": "ubuntu-24-04-x64",
  "user_data": "#cloud-config\npackage_update: true\n...",
  "ipv6": true,
  "tags": ["passim"]
}
```

**Hetzner:**
```json
{
  "name": "passim-fsn",
  "server_type": "cx22",
  "image": "ubuntu-24.04",
  "location": "fsn1",
  "user_data": "#cloud-config\npackage_update: true\n...",
  "labels": { "app": "passim" },
  "start_after_create": true,
  "public_net": { "enable_ipv4": true, "enable_ipv6": true }
}
```

**Lightsail:** (注意: 全部 POST，action 通过 `X-Amz-Target` 指定)
```json
// Header: X-Amz-Target: Lightsail_20161128.CreateInstances
{
  "instanceNames": ["passim-tokyo"],
  "availabilityZone": "ap-northeast-1a",
  "blueprintId": "ubuntu_24_04",
  "bundleId": "nano_3_0",
  "userData": "#!/bin/bash\napt-get update...",
  "ipAddressType": "dualstack",
  "tags": [{ "key": "app", "value": "passim" }]
}
```

**Linode:**
```json
{
  "region": "ap-northeast",
  "type": "g6-nanode-1",
  "image": "linode/ubuntu24.04",
  "label": "passim-tokyo",
  "tags": ["passim"],
  "root_pass": "<随机生成>",
  "metadata": {
    "user_data": "<base64 编码的 cloud-init>"
  }
}
```

### 关键实现差异

**1. Vultr 和 Linode 的 user_data 必须 Base64 编码，其他三家接受明文**
```typescript
// lib/cloud/vultr.ts & linode.ts
const userData = Buffer.from(cloudInitScript).toString('base64');
// DO / Hetzner / Lightsail 直接传明文
// 注意: Linode 的字段是 metadata.user_data (嵌套)
```

**2. Lightsail 需要 AWS Signature V4 签名**

Lightsail 不是简单的 Bearer Token，需要完整的 AWS 签名流程。在 React Native 中使用轻量库:

```typescript
// 方案: 使用 @smithy/signature-v4 (~15KB gzipped)
// 或纯手写 HMAC-SHA256 签名链 (避免引入 aws-sdk)
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const signer = new SignatureV4({
  service: 'lightsail',
  region: 'ap-northeast-1',
  credentials: { accessKeyId, secretAccessKey },
  sha256: Sha256,
});
```

**3. Lightsail 用实例名称而非 ID 标识**
```typescript
// Lightsail: getInstance('passim-tokyo') → { instanceName: 'passim-tokyo' }
// 其他三家: getInstance('cb676a46-...') → UUID/Int ID
```

**4. Hetzner 用 labels (key-value) 而非 tags (array)**
```typescript
// Vultr/DO: tags: ['passim', 'ak_xxxx']
// Hetzner:  labels: { app: 'passim', apiKey: 'ak_xxxx' }
// Lightsail: tags: [{ key: 'app', value: 'passim' }]
```

### 统一接口定义: 能力 (Capability) 模型

不再硬分"VPS 厂商"和"存储厂商"。每个 Provider 声明自己支持哪些能力，App 层根据能力动态渲染 UI。

```typescript
// lib/cloud/types.ts

type ProviderId = 'vultr' | 'digitalocean' | 'hetzner' | 'lightsail' | 'linode' | 'cloudflare';

// 能力类型
type Capability = 'compute' | 'storage' | 'tunnel' | 'dns';

// ─── 核心: Provider 只负责声明能力 + 认证 ───

interface CloudProvider {
  id: ProviderId;
  name: string;
  icon: string;
  website: string;                    // API Key 获取页面
  capabilities: Capability[];         // 声明支持的能力

  // 账号验证 (所有 provider 必须实现)
  validateCredentials(creds: ProviderCredentials): Promise<AccountInfo>;

  // 按能力返回具体实现 (类型安全)
  compute?:  ComputeCapability;       // 有 'compute' 能力时提供
  storage?:  StorageCapability;       // 有 'storage' 能力时提供
  tunnel?:   TunnelCapability;        // 有 'tunnel' 能力时提供
  dns?:      DnsCapability;           // 有 'dns' 能力时提供
}

// ─── 能力接口: 每种能力独立定义 ───

interface ComputeCapability {
  listRegions(): Promise<Region[]>;
  listPlans(regionId: string): Promise<Plan[]>;
  createInstance(opts: CreateInstanceOpts): Promise<{ instanceId: string }>;
  getInstance(id: string): Promise<Instance>;
  deleteInstance(id: string): Promise<void>;
  powerAction(id: string, action: 'on' | 'off' | 'reboot'): Promise<void>;
  encodeUserData(script: string): string;  // Base64 或明文
}

interface StorageCapability {
  listRegions(): Promise<StorageRegion[]>;
  createBucket(opts: CreateBucketOpts): Promise<StorageCredentials>;
  deleteBucket(id: string): Promise<void>;
  listBuckets(): Promise<BucketInfo[]>;
  egressFree: boolean;                // Cloudflare R2 = true
}

interface TunnelCapability {
  createTunnel(opts: CreateTunnelOpts): Promise<TunnelInfo>;
  deleteTunnel(id: string): Promise<void>;
  listTunnels(): Promise<TunnelInfo[]>;
  getTunnelToken(id: string): Promise<string>;  // cloudflared 连接 token
}

interface DnsCapability {
  listZones(): Promise<DnsZone[]>;
  listRecords(zoneId: string): Promise<DnsRecord[]>;
  createRecord(zoneId: string, record: DnsRecord): Promise<DnsRecord>;
  deleteRecord(zoneId: string, recordId: string): Promise<void>;
}

// ─── 通用类型 ───

interface ProviderCredentials {
  apiKey?: string;                   // Vultr / DO / Hetzner / Linode / Cloudflare
  accessKeyId?: string;              // AWS
  secretAccessKey?: string;          // AWS
  region?: string;                   // Lightsail 需要
  accountId?: string;                // Cloudflare 需要
}

interface AccountInfo {
  email?: string;
  name?: string;
  balance?: number;
  valid: boolean;
  capabilities: Capability[];        // 该账号实际可用的能力
  error?: string;
}

// Compute 类型
interface Region {
  id: string;
  name: string;                      // "Tokyo", "Frankfurt"
  country: string;                   // "JP", "DE"
  continent: 'asia' | 'americas' | 'europe' | 'oceania';
  available: boolean;
}

interface Plan {
  id: string;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  bandwidthTb: number;
  monthlyPrice: number;              // USD
  hourlyPrice?: number;
  recommended: boolean;
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

// Tunnel 类型
interface TunnelInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'degraded';
  hostname: string;                  // xxx.cfargotunnel.com 或自定义域名
  createdAt: string;
}

interface CreateTunnelOpts {
  name: string;
  hostname?: string;                 // 自定义域名 (需要 dns 能力)
}

// DNS 类型
interface DnsZone {
  id: string;
  name: string;                      // example.com
  status: 'active' | 'pending';
}

interface DnsRecord {
  id?: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;                 // Cloudflare 特有
}
```

### 能力矩阵 (代码层面)

```typescript
// lib/cloud/registry.ts

const providers: Record<ProviderId, CloudProvider> = {
  vultr:        { capabilities: ['compute', 'storage'],                compute: new VultrCompute(), storage: new VultrStorage(), ... },
  digitalocean: { capabilities: ['compute', 'storage'],                compute: new DOCompute(),    storage: new DOStorage(),    ... },
  hetzner:      { capabilities: ['compute', 'storage'],                compute: new HetznerCompute(), storage: new HetznerStorage(), ... },
  lightsail:    { capabilities: ['compute', 'storage'],                compute: new LightsailCompute(), storage: new LightsailStorage(), ... },
  linode:       { capabilities: ['compute', 'storage'],                compute: new LinodeCompute(), storage: new LinodeStorage(), ... },
  cloudflare:   { capabilities: ['storage', 'tunnel', 'dns'],         storage: new CloudflareR2(), tunnel: new CloudflareTunnel(), dns: new CloudflareDns(), ... },
};

// App 中使用:
const provider = providers['cloudflare'];
if (provider.tunnel) {
  // 展示隧道管理 UI
  const tunnels = await provider.tunnel.listTunnels();
}
```

### cloud-init 脚本 (通用)

```yaml
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
    # Passim 启动后，/api/status 会包含 setup_token
    # App 通过轮询此端点检测就绪，然后用 setup_token 完成首次连接
```

### API Key 回传: Passim setup_token 方案

不依赖各厂商的 tag/label (差异太大)，改用 Passim 自身的 setup_token 机制:

```
1. cloud-init 传入 PASSIM_API_KEY 环境变量
2. Passim 首次启动时，如果检测到 PASSIM_API_KEY:
   - 用它作为初始 API Key
   - 同时生成一个一次性 setup_token
   - GET /api/status (无需认证) 返回 { "setup": true, "setup_token": "xxx" }
3. App 轮询 GET https://{ip}:8443/api/status
   - 收到 setup_token → POST /api/auth/setup { setup_token } → { token: "jwt..." }
   - setup_token 使用一次后失效
4. 连接完成，App 保存 JWT
```

这样 API Key 不需要写回 cloud metadata，全流程在 Passim ↔ App 之间完成。

**轮询流程:**
```
App 创建实例 → 拿到公网 IP
  → 等待 cloud API status == running (间隔 5s，超时 2 分钟)
  → 等待 Passim 就绪:
      轮询 GET https://{ip}:8443/api/status (忽略自签 TLS)
      间隔 10s，超时 5 分钟
  → 收到 setup_token
  → POST /api/auth/setup { setup_token }
  → 拿到 JWT → 保存节点 → 完成
```

### 安全考虑

| 威胁 | 对策 |
|------|------|
| API Key 泄露 | SecureStore 加密存储 + App 锁 (生物认证) |
| 中间人攻击 | HTTPS 直连云 API (TLS) |
| API Key 权限过大 | 引导用户创建最小权限 key (只需 compute + 可选 storage) |
| 意外扣费 | 创建前显示价格确认，二次确认后才下单 |
| 孤儿实例 (App 崩溃) | 本地持久化 pending instanceId，重启后可恢复/销毁 |
| setup_token 窗口期 | 一次性使用，60 分钟过期，只在首次启动时生成 |
| Lightsail Secret Key | 与 API Key 同等保护级别，存 SecureStore |
