# Remote Desktop (rdesktop)

## 概述

通过 RDP 协议访问的远程桌面环境，适用于需要远程图形化操作的场景。基于 LinuxServer 的 rdesktop 镜像，提供完整的 Linux 桌面环境，可通过任意 RDP 客户端连接。

## 技术规格

- **Docker 镜像**: `linuxserver/rdesktop`
- **端口映射**: `3389:3389`（标准 RDP 端口）
- **卷挂载**:
  - `{{node.data_dir}}/configs/rdesktop:/config` — 配置和用户数据
- **环境变量**:
  - `PUID`: `1000` — 运行用户 UID
  - `PGID`: `1000` — 运行用户 GID
  - `CUSTOM_RES`: `{{settings.resolution}}` — 桌面分辨率
- **启动参数 (Cmd)**: 无（使用镜像默认 CMD）
- **特殊要求**: 无额外 capabilities
- **配置文件**: 无（通过环境变量配置）
- **重启策略**: unless-stopped
- **Labels**: `io.passim: tools`, `io.passim.app: rdesktop`

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `resolution` | select | `1920x1080` | 远程会话的桌面分辨率 |

### 分辨率选项

| 值 | 说明 |
|----|------|
| `1920x1080` | 1920x1080（全高清） |
| `1280x720` | 1280x720（高清） |
| `2560x1440` | 2560x1440（2K） |
| `1366x768` | 1366x768 |
| `1024x768` | 1024x768 |

## 用户故事

- **US-APP-7.1: 部署 Remote Desktop**
  - 作为用户，我想一键部署远程桌面环境
  - 验收标准: 容器运行，3389 端口可访问，RDP 服务正常响应

- **US-APP-7.2: 连接 Remote Desktop**
  - 作为用户，我想从客户端连接到已部署的远程桌面
  - 验收标准: 使用 RDP 客户端连接到服务器 IP 的 3389 端口后可以看到桌面环境

- **US-APP-7.3: 管理 Remote Desktop**
  - 作为用户，我想查看/修改/卸载远程桌面
  - 验收标准: 分辨率可修改，服务可停止/重启/删除

## 客户端配置

### 桌面端 — RDP 客户端

使用任意 RDP 客户端连接到服务器 IP 的 3389 端口。

- **Windows**: 远程桌面连接（mstsc.exe），内置于系统
- **macOS**: [Microsoft Remote Desktop](https://apps.apple.com/app/microsoft-remote-desktop/id1295203466)
- **Linux**: [Remmina](https://remmina.org/) 或 `xfreerdp`

### 移动端 — Microsoft Remote Desktop

从应用商店安装 Microsoft 远程桌面并连接到服务器 IP。

- **iOS**: [App Store](https://apps.apple.com/app/microsoft-remote-desktop/id714464092)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=com.microsoft.rdc.androidx)

## 已知限制

- 性能取决于网络带宽和服务器资源
- 默认不支持 GPU 加速

## 测试要求

- **模板渲染测试**: 验证 `resolution` setting（select 类型）正确渲染到 `CUSTOM_RES` 环境变量；验证 `PUID` 和 `PGID` 固定值正确传递
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括环境变量和端口映射正确传递
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `linuxserver/rdesktop` 镜像，启动容器，验证 RDP 服务启动并监听 3389 端口
