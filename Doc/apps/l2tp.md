# L2TP/IPSec

## 概述

L2TP/IPSec VPN 服务器，兼容各种设备的内置 VPN 客户端。适用于不想安装额外客户端软件、希望使用系统自带 VPN 功能的场景。所有主流操作系统（Windows、macOS、iOS、Android、Linux）均内置 L2TP/IPSec 支持。

## 技术规格

- **Docker 镜像**: `hwdsl2/ipsec-vpn-server`
- **端口映射**:
  - `500:500/udp` — IKE (Internet Key Exchange)
  - `4500:4500/udp` — NAT-T (NAT Traversal)
- **卷挂载**:
  - `{{node.data_dir}}/configs/l2tp:/etc/ipsec.d` — IPSec 配置和证书
  - `/lib/modules:/lib/modules:ro` — 宿主机内核模块（只读）
- **环境变量**:
  - `VPN_IPSEC_PSK`: `{{settings.vpn_psk}}` — IPSec 预共享密钥
  - `VPN_USER`: `{{settings.vpn_user}}` — VPN 用户名
  - `VPN_PASSWORD`: `{{settings.vpn_password}}` — VPN 密码
- **启动参数 (Cmd)**: 无（使用镜像默认 CMD）
- **特殊要求**:
  - `cap_add`: `NET_ADMIN`
  - 需要访问宿主机 `/lib/modules` 以加载内核模块
- **配置文件**: 无（通过环境变量配置）
- **重启策略**: unless-stopped
- **Labels**: `io.passim: vpn`, `io.passim.app: l2tp`

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `vpn_user` | string | `vpnuser` | VPN 认证用户名 |
| `vpn_password` | string | `{{generated.vpn_password}}` (随机 16 位) | VPN 认证密码 |
| `vpn_psk` | string | `{{generated.vpn_psk}}` (随机 24 位) | IPSec 连接预共享密钥 |

## 用户故事

- **US-APP-2.1: 部署 L2TP/IPSec**
  - 作为用户，我想一键部署 L2TP/IPSec VPN
  - 验收标准: 容器运行，UDP 500/4500 端口可访问，VPN 服务正常响应

- **US-APP-2.2: 连接 L2TP/IPSec**
  - 作为用户，我想从客户端连接到已部署的 L2TP/IPSec VPN
  - 验收标准: 使用系统自带 VPN 客户端，填入服务器 IP、用户名、密码和 PSK 后可以成功连接

- **US-APP-2.3: 管理 L2TP/IPSec**
  - 作为用户，我想查看/修改/卸载 L2TP/IPSec
  - 验收标准: 凭据可修改，服务可停止/重启/删除

## 客户端配置

### 移动端 — 系统自带 VPN 客户端

使用设备自带的 L2TP/IPSec VPN 设置，填入服务器 IP、用户名、密码和 PSK。

- **iOS**: 设置 > 通用 > VPN > 添加 VPN 配置 > 类型选择 L2TP
- **Android**: 设置 > 网络 > VPN > 添加 VPN > 类型选择 L2TP/IPSec PSK

### 桌面端 — 系统自带 VPN 客户端

打开网络设置，添加 L2TP/IPSec VPN 连接并填入服务器凭据。

- **Windows**: 设置 > 网络 > VPN > 添加 VPN 连接 > 类型选择 L2TP/IPSec (预共享密钥)
- **macOS**: 系统偏好设置 > 网络 > + > VPN > 类型选择 L2TP over IPSec
- **Linux**: `sudo apt install xl2tpd` 或使用 NetworkManager

## 已知限制

- 需要 `NET_ADMIN` capability
- 需要访问宿主机 `/lib/modules` 以加载内核模块
- UDP 端口 500 和 4500 不能被其他服务占用

## 测试要求

- **模板渲染测试**: 验证 `vpn_user`、`vpn_password`、`vpn_psk` 正确渲染到对应环境变量；验证 `generated` 值（random_string）正确生成
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括 `cap_add` 和只读卷挂载正确传递
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `hwdsl2/ipsec-vpn-server` 镜像，启动容器，验证 IPSec 服务启动
