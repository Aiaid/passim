# WebDAV

## 概述

WebDAV 文件服务器，用于远程文件访问。适用于需要跨平台文件同步和远程存储的场景，所有主流操作系统和文件管理器均内置 WebDAV 支持。

## 技术规格

- **Docker 镜像**: `bytemark/webdav`
- **端口映射**: `8080:80`（对外暴露 8080/tcp）
- **卷挂载**:
  - `{{node.data_dir}}/files/webdav:/var/lib/dav` — 文件存储目录
- **环境变量**:
  - `AUTH_TYPE`: `Digest` — 认证方式
  - `USERNAME`: `{{settings.username}}` — 认证用户名
  - `PASSWORD`: `{{settings.password}}` — 认证密码
- **启动参数 (Cmd)**: 无（使用镜像默认 CMD）
- **特殊要求**: 无额外 capabilities
- **配置文件**: 无（通过环境变量配置）
- **重启策略**: unless-stopped
- **Labels**: `io.passim: storage`, `io.passim.app: webdav`

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `username` | string | `admin` | WebDAV 认证用户名 |
| `password` | string | `{{generated.password}}` (随机 20 位) | WebDAV 认证密码 |

## 用户故事

- **US-APP-5.1: 部署 WebDAV**
  - 作为用户，我想一键部署 WebDAV 文件服务器
  - 验收标准: 容器运行，8080 端口可访问，WebDAV 服务正常响应

- **US-APP-5.2: 连接 WebDAV**
  - 作为用户，我想从客户端连接到已部署的 WebDAV 服务
  - 验收标准: 使用文件管理器或 WebDAV 客户端，填入服务器 URL 和凭据后可以成功访问文件

- **US-APP-5.3: 管理 WebDAV**
  - 作为用户，我想查看/修改/卸载 WebDAV
  - 验收标准: 用户名和密码可修改，服务可停止/重启/删除

## 客户端配置

### Web 访问

- **URL**: `http://<服务器 IP>:8080`
- 通过浏览器直接访问 WebDAV 服务器

### 桌面端 — 文件管理器 / Cyberduck

映射网络驱动器或使用 WebDAV 客户端，填入服务器 URL 和凭据。

- **Windows**: 文件管理器 > 此电脑 > 映射网络驱动器 > 输入 `http://<服务器 IP>:8080`
- **macOS**: Finder > 前往 > 连接服务器 > 输入 `http://<服务器 IP>:8080`
- **Linux**: 文件管理器中添加网络位置，或使用 `davfs2` 挂载
- **跨平台**: [Cyberduck](https://cyberduck.io/) — 支持 WebDAV 的图形化客户端

### 移动端

- **iOS**: 文件 App > 连接服务器 > 输入 WebDAV 地址
- **Android**: Solid Explorer、CX 文件管理器等支持 WebDAV 的应用

## 已知限制

- 无内置 TLS 支持，生产环境建议使用反向代理提供 HTTPS
- 仅支持 Digest 认证，不支持 OAuth 或 token 认证

## 测试要求

- **模板渲染测试**: 验证 `username`、`password` 正确渲染到 `USERNAME`、`PASSWORD` 环境变量；验证 `AUTH_TYPE` 固定为 `Digest`；验证 `generated.password`（random_string, length 20）正确生成
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括环境变量和端口映射正确传递
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `bytemark/webdav` 镜像，启动容器，验证 WebDAV 服务启动并可通过 HTTP 访问
