# Samba

## 概述

Samba 文件共享服务器，用于局域网文件访问。适用于局域网内多设备文件共享场景，Windows、macOS、Linux 均原生支持 SMB/CIFS 协议，无需安装额外客户端。

## 技术规格

- **Docker 镜像**: `dperson/samba`
- **端口映射**:
  - `139:139` — NetBIOS Session Service
  - `445:445` — SMB over TCP
- **卷挂载**:
  - `{{node.data_dir}}/files/samba:/mount` — 文件共享目录
- **环境变量**: 无（通过命令行参数配置）
- **启动参数 (Cmd)**:
  - `-u` `{{settings.username}};{{settings.password}}` — 创建用户
  - `-s` `{{settings.share_name}};/mount;yes;no;no;{{settings.username}}` — 创建共享
- **特殊要求**: 无额外 capabilities
- **配置文件**: 无（通过 Cmd 参数配置）
- **重启策略**: unless-stopped
- **Labels**: `io.passim: storage`, `io.passim.app: samba`

### Cmd 参数说明

`-s` 参数格式: `共享名;路径;可浏览;只读;允许Guest;授权用户`

- `{{settings.share_name}}` — 共享名称
- `/mount` — 容器内共享路径
- `yes` — 可浏览
- `no` — 非只读
- `no` — 不允许 Guest 访问
- `{{settings.username}}` — 授权用户

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `username` | string | `user` | Samba 认证用户名 |
| `password` | string | `{{generated.password}}` (随机 16 位) | Samba 认证密码 |
| `share_name` | string | `share` | 网络上可见的 Samba 共享名称 |

## 用户故事

- **US-APP-6.1: 部署 Samba**
  - 作为用户，我想一键部署 Samba 文件共享
  - 验收标准: 容器运行，139/445 端口可访问，SMB 服务正常响应

- **US-APP-6.2: 连接 Samba**
  - 作为用户，我想从客户端连接到已部署的 Samba 共享
  - 验收标准: 使用文件管理器，填入服务器地址和凭据后可以成功访问共享文件夹

- **US-APP-6.3: 管理 Samba**
  - 作为用户，我想查看/修改/卸载 Samba
  - 验收标准: 用户名、密码和共享名可修改，服务可停止/重启/删除

## 客户端配置

### 桌面端 — 文件管理器

打开文件管理器，使用配置的凭据连接到 SMB 共享。

- **Windows**: 文件管理器地址栏输入 `\\<服务器 IP>\<共享名>`，或映射网络驱动器
- **macOS**: Finder > 前往 > 连接服务器 > 输入 `smb://<服务器 IP>/<共享名>`
- **Linux**: 文件管理器输入 `smb://<服务器 IP>/<共享名>`，或使用 `mount -t cifs //<服务器 IP>/<共享名> /mnt/share -o username=<用户名>`

### 移动端

- **iOS**: 文件 App > 连接服务器 > 输入 `smb://<服务器 IP>/<共享名>`
- **Android**: 使用 Solid Explorer、CX 文件管理器等支持 SMB 的应用

## 已知限制

- 最适合局域网使用，不建议在无 VPN 的情况下暴露到公网
- SMB 端口（139、445）可能被 ISP 或防火墙阻止

## 测试要求

- **模板渲染测试**: 验证 `username`、`password`、`share_name` 正确渲染到 `args`；验证 `generated.password`（random_string, length 16）正确生成；验证 Cmd 参数格式正确
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括 `args` 正确传递到 Docker Cmd
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `dperson/samba` 镜像，启动容器，验证 SMB 服务启动并可通过 SMB 协议访问
