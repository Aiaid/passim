# Hysteria 2

## 概述

基于 QUIC 协议的快速抗审查代理，适用于网络受限环境下的安全访问。Hysteria 2 以极高的传输速度和强大的抗封锁能力著称，支持自签 TLS 证书和 ACME 自动证书。

## 技术规格

- **Docker 镜像**: `tobyxdd/hysteria`
- **端口映射**: `{{settings.port}}:443/udp`（默认对外暴露 443/udp）
- **卷挂载**:
  - `{{node.data_dir}}/configs/hysteria:/etc/hysteria` — 配置文件存储
- **环境变量**: 无（通过配置文件配置）
- **启动参数 (Cmd)**: `server -c /etc/hysteria/config.yaml`
- **特殊要求**: 无额外 capabilities
- **配置文件**:
  - `{{node.data_dir}}/configs/hysteria/config.yaml` — Hysteria 2 服务端配置
- **重启策略**: unless-stopped
- **Labels**: `io.passim: vpn`, `io.passim.app: hysteria`

### 配置文件模板

```yaml
listen: :443
auth:
  type: password
  password: {{settings.password}}
masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
```

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `port` | number (1-65535) | `443` | 服务器监听的 UDP 端口 |
| `password` | string | `{{generated.password}}` (随机 32 位) | 客户端认证密码 |
| `domain` | string (advanced) | `""` | 用于 ACME 自动获取 TLS 证书的域名，留空则使用自签证书 |

## 用户故事

- **US-APP-3.1: 部署 Hysteria 2**
  - 作为用户，我想一键部署 Hysteria 2 代理
  - 验收标准: 容器运行，UDP 端口可访问，Hysteria 服务正常响应

- **US-APP-3.2: 连接 Hysteria 2**
  - 作为用户，我想从客户端连接到已部署的 Hysteria 2
  - 验收标准: 使用 Hysteria 2 客户端，配置服务器地址、端口和密码后可以成功连接

- **US-APP-3.3: 管理 Hysteria 2**
  - 作为用户，我想查看/修改/卸载 Hysteria 2
  - 验收标准: 密码和端口可修改，服务可停止/重启/删除

## 客户端配置

### 连接信息

- **协议**: Hysteria 2 (QUIC)
- **服务器**: `<服务器 IP>:<port>`
- **密码**: settings 中设置的 password
- **TLS**: 未提供域名时使用自签证书，客户端需启用 insecure 模式

### 推荐客户端

- **iOS**: Stash, Shadowrocket
- **Android**: NekoBox, Clash Meta for Android
- **Windows**: Clash Verge, nekoray
- **macOS**: Clash Verge, Stash

安装客户端后，使用服务器地址、端口和密码进行配置，然后连接。

## 已知限制

- 使用 UDP 协议，某些网络可能会阻止或限速 UDP 流量
- 未提供域名时使用自签 TLS 证书，客户端必须设置 insecure 模式

## 测试要求

- **模板渲染测试**: 验证 `port`、`password` 正确渲染到配置文件模板；验证 `generated.password`（random_string, length 32）正确生成；验证 `args` 正确传递
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括配置文件写入和 `args` 传递到 Docker Cmd
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `tobyxdd/hysteria` 镜像，启动容器，验证 Hysteria 服务启动并监听指定端口
