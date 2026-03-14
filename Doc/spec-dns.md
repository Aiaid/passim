# DNS 服务详细设计

> 配合 [rewrite-plan.md](./rewrite-plan.md) 使用

---

## 概述

Passim DNS 是一个轻量级的动态域名解析服务——它把 IP 地址编码进域名里，让每台 VPS 自动拥有一个可用的域名，不需要用户购买域名或配置 DNS 记录。

用户不需要知道这个服务的存在。当 Passim 节点需要一个域名时（比如申请 SSL 证书），它会自动使用 Base32 编码的 IP 作为子域名查询 DNS 服务，DNS 服务解码后直接返回对应的 IP 地址。

例如：IP `203.0.113.10` → Base32 编码 → `ywahcia` → 域名 `ywahcia.dns.passim.io` → 解析回 `203.0.113.10`

---

## 技术栈

```
Python 3.10+
├── nserver          # DNS 服务器框架
├── IP2Location      # IP 地理位置数据库
├── ipaddress        # Python 标准库，IP 地址解析
└── base64           # Python 标准库，Base32 编码/解码
```

---

## 架构

```
                DNS 查询
                  │
                  ▼
┌──────────────────────────────────────┐
│          nserver (port 153)          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │     路由规则 (优先级从高到低)   │  │
│  │                                │  │
│  │  1. Base32 IPv4 反解 (8 字符)  │  │
│  │  2. Base32 IPv6 反解 (32 字符) │  │
│  │  3. Base32 双栈反解 (40 字符)  │  │
│  │  4. 直接 IPv4 反解             │  │
│  │  5. 直接 IPv6 反解 (x 替代 :) │  │
│  │  6. TXT 地理位置查询           │  │
│  │  7. NS / SOA / 通配 A 记录    │  │
│  └────────────────────────────────┘  │
│                │                      │
│       ┌────────┴────────┐            │
│       ▼                 ▼            │
│  ┌─────────┐    ┌──────────────┐    │
│  │ base64  │    │ IP2Location  │    │
│  │ b32decode│   │ DB1 (国家)   │    │
│  └─────────┘    └──────────────┘    │
└──────────────────────────────────────┘
```

---

## 域名编码方案

### Base32 编码

将 IP 地址的二进制表示用 Base32 编码，嵌入子域名中。使用 `8` 替代标准 Base32 的 `=` 填充符（`=` 在域名中不合法）。

| IP 版本 | 字节数 | Base32 长度 | 示例 |
|---------|--------|------------|------|
| IPv4 | 4 字节 | 8 字符 | `203.0.113.10` → `ywahcia8` |
| IPv6 | 16 字节 | 32 字符 | `2001:db8::1` → (32 字符) |
| 双栈 | 20 字节 | 40 字符 | 前 8 字符 IPv4 + 后 32 字符 IPv6 |

### 直接 IP 域名

除了 Base32，也支持直接把 IP 地址写在域名里：

| 格式 | 示例域名 | 解析结果 |
|------|---------|---------|
| IPv4 | `203.0.113.10.dns.passim.io` | A: `203.0.113.10` |
| IPv6 | `2001xdb8xx1.dns.passim.io` | AAAA: `2001:db8::1` (x → :) |

---

## DNS 记录类型

### A 记录 (IPv4)

```
查询: ywahcia8.dns.passim.io A
  → Base32 解码 8 字符 → IPv4
  → 返回: 203.0.113.10

查询: 203.0.113.10.dns.passim.io A
  → 直接解析为 IPv4
  → 返回: 203.0.113.10

查询: (40字符).dns.passim.io A
  → 取前 8 字符 Base32 解码为 IPv4
  → 返回: IPv4 地址
```

### AAAA 记录 (IPv6)

```
查询: (32字符).dns.passim.io AAAA
  → Base32 解码 32 字符 → IPv6
  → 返回: IPv6 地址

查询: (40字符).dns.passim.io AAAA
  → 取后 32 字符 Base32 解码为 IPv6
  → 返回: IPv6 地址

查询: 2001xdb8xx1.dns.passim.io AAAA
  → x 替换为 :，解析为 IPv6
  → 返回: 2001:db8::1
```

### TXT 记录 (地理位置)

```
查询: 203.0.113.10.dns.passim.io TXT
  → IP2Location 查询国家代码
  → 返回: "US"
```

仅支持直接 IPv4 格式，用于 Passim 获取节点的地理位置信息（国旗 emoji）。

### NS 记录

```
查询: ns.dns.passim.io A
  → 返回 DNS 服务器自身 IP

查询: *.dns.passim.io NS
  → 返回: ns.dns.passim.io
```

### SOA 记录

```
查询: *.dns.passim.io SOA
  → 返回标准 SOA 记录
  → MNAME: ns.dns.passim.io
  → RNAME: root.dns.passim.io
```

---

## 配置

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `BASE_DOMAIN` | 基础域名 | `dns.passim.io` |
| `IP` | DNS 服务器自身 IP (用于 NS/A 记录) | `203.0.113.1` |

### 数据文件

| 文件 | 说明 |
|------|------|
| `/code/app/ip2loc/IP2LOCATION-LITE-DB1.BIN` | IP2Location Lite 数据库 (仅国家) |

---

## 部署

### Docker

```dockerfile
FROM python:3.10-slim
WORKDIR /code
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ app/
EXPOSE 153/udp 153/tcp
CMD ["python", "app/app.py"]
```

```bash
docker run -d \
  --name passim-dns \
  -p 153:153/udp \
  -p 153:153/tcp \
  -e BASE_DOMAIN="dns.passim.io" \
  -e IP="203.0.113.1" \
  passim/dns:latest
```

### 上游 DNS 配置

需要在域名注册商处将 `dns.passim.io` 的 NS 记录指向运行此服务的服务器 IP。

---

## 在 Passim 中的使用

Passim 节点启动时：

1. 获取自身公网 IP
2. Base32 编码 IP → 生成域名 (`ywahcia8.dns.passim.io`)
3. 用这个域名申请 Let's Encrypt SSL 证书 (autocert ACME HTTP-01)
4. 查询 TXT 记录获取地理位置 (国旗 emoji 显示在 Dashboard)

用户看到的只是 Dashboard 上的 🇯🇵 图标和正常工作的 HTTPS——不需要知道背后有 DNS 编码。

---

## 性能与限制

| 指标 | 值 |
|------|-----|
| 监听端口 | 153 (非标准，需上游转发或直接使用) |
| 并发查询 | 取决于 nserver，通常 1000+ qps |
| 内存占用 | < 50 MB (含 IP2Location 数据库) |
| 支持记录类型 | A, AAAA, TXT, NS, SOA |
| 不支持 | MX, CNAME, SRV (返回空响应) |

### 未来可选改进

- Go 重写 (减少依赖，嵌入 Passim 主进程)
- 支持 IPv6 TXT 地理位置查询
- 缓存层 (高频查询缓存)
- 健康检查端点 (`/health`)
