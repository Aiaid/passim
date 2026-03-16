# WireGuard

## 概述

基于 WireGuard 协议的点对点 VPN，适用于需要安全、高性能远程访问的场景。WireGuard 以其简洁的代码库和优秀的性能著称，是目前最推荐的 VPN 方案之一。

## 技术规格

- **Docker 镜像**: `linuxserver/wireguard`
- **端口映射**: `51820:51820/udp`
- **卷挂载**:
  - `{{node.data_dir}}/configs/wireguard:/config` — 配置和密钥存储
- **环境变量**:
  - `PEERS`: `{{settings.peers}}` — 对等节点数量
- **启动参数 (Cmd)**: 无（使用镜像默认 CMD）
- **特殊要求**:
  - `cap_add`: `NET_ADMIN`, `SYS_MODULE`
  - `sysctls`: `net.ipv4.conf.all.src_valid_mark=1`
  - 宿主机需要支持 WireGuard 内核模块或安装 wireguard-tools
- **配置文件**: 无（通过环境变量配置）
- **重启策略**: unless-stopped
- **Labels**: `io.passim: vpn`, `io.passim.app: wireguard`

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `peers` | number (1-25) | `1` | 要生成多少个对等节点配置文件 |

## 用户故事

- **US-APP-1.1: 部署 WireGuard**
  - 作为用户，我想一键部署 WireGuard VPN
  - 验收标准: 容器运行，UDP 51820 端口可访问，WireGuard 服务正常响应

- **US-APP-1.2: 连接 WireGuard**
  - 作为用户，我想从客户端连接到已部署的 WireGuard VPN
  - 验收标准: 下载生成的 .conf 文件或扫描二维码，导入 WireGuard 客户端后可以成功连接

- **US-APP-1.3: 管理 WireGuard**
  - 作为用户，我想查看/修改/卸载 WireGuard
  - 验收标准: peers 数量可修改，服务可停止/重启/删除

## 客户端配置

### 移动端 — WireGuard 应用

从应用商店安装 WireGuard，扫描二维码或导入 .conf 文件。

- **iOS**: [App Store](https://apps.apple.com/app/wireguard/id1441195209)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=com.wireguard.android)

### 桌面端 — WireGuard 客户端

从 [wireguard.com](https://www.wireguard.com/install/) 下载 WireGuard 并导入生成的节点 .conf 文件。

### 配置文件导出

- **格式**: `.conf`
- **路径**: `{{node.data_dir}}/configs/wireguard/wg_confs/`
- **文件匹配**: `peer*.conf`

## 已知限制

- 需要 `NET_ADMIN` 和 `SYS_MODULE` capabilities
- 宿主机必须支持 WireGuard 内核模块或安装 wireguard-tools
- UDP 端口 51820 不能被防火墙阻止

## 测试要求

- **模板渲染测试**: 验证 `peers` setting 正确渲染到 `PEERS` 环境变量
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括 `cap_add` 和 `sysctls` 正确传递
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `linuxserver/wireguard` 镜像，启动容器，验证 WireGuard 服务启动并生成 peer 配置文件
