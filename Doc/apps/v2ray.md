# V2Ray

## 概述

基于 VMess 协议的代理服务器，适用于需要灵活代理配置的场景。V2Ray 是一个功能丰富的网络代理平台，拥有广泛的客户端生态支持。

## 技术规格

- **Docker 镜像**: `v2fly/v2fly-core`
- **端口映射**: `{{settings.port}}:10086`（默认对外暴露 10086/tcp）
- **卷挂载**:
  - `{{node.data_dir}}/configs/v2ray:/etc/v2ray` — 配置文件存储
- **环境变量**: 无（通过配置文件配置）
- **启动参数 (Cmd)**: `run -c /etc/v2ray/config.json`
- **特殊要求**: 无额外 capabilities
- **配置文件**:
  - `{{node.data_dir}}/configs/v2ray/config.json` — V2Ray 服务端配置
- **重启策略**: unless-stopped
- **Labels**: `io.passim: vpn`, `io.passim.app: v2ray`

### 配置文件模板

```json
{
  "inbounds": [
    {
      "port": 10086,
      "protocol": "vmess",
      "settings": {
        "clients": [
          {
            "id": "{{settings.uuid}}",
            "alterId": 0
          }
        ]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "settings": {}
    }
  ]
}
```

## Settings (用户配置项)

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `port` | number (1-65535) | `10086` | VMess 入站连接的 TCP 端口 |
| `uuid` | string | `{{generated.uuid}}` (自动生成 UUID v4) | VMess 认证 UUID |

## 用户故事

- **US-APP-4.1: 部署 V2Ray**
  - 作为用户，我想一键部署 V2Ray 代理
  - 验收标准: 容器运行，TCP 端口可访问，VMess 服务正常响应

- **US-APP-4.2: 连接 V2Ray**
  - 作为用户，我想从客户端连接到已部署的 V2Ray
  - 验收标准: 使用 V2Ray 客户端，配置服务器地址、端口、UUID 和 alterId 0 后可以成功连接

- **US-APP-4.3: 管理 V2Ray**
  - 作为用户，我想查看/修改/卸载 V2Ray
  - 验收标准: 端口和 UUID 可修改，服务可停止/重启/删除

## 客户端配置

### 连接信息

- **协议**: VMess
- **地址**: `<服务器 IP>`
- **端口**: settings 中设置的 port（默认 10086）
- **UUID**: settings 中的 uuid
- **alterId**: `0`

### 移动端 — v2rayNG (Android) / Shadowrocket (iOS)

导入 VMess 配置或手动添加服务器，填入地址、端口、UUID 和 alterId 0。

### 桌面端 — v2rayN / Qv2ray

添加 VMess 服务器，填入服务器地址、端口、UUID 和 alterId 0。

- **Windows**: [v2rayN](https://github.com/2dust/v2rayN)
- **macOS/Linux**: [Qv2ray](https://github.com/Qv2ray/Qv2ray) 或 [V2RayXS](https://github.com/tzmax/V2RayXS)

## 已知限制

- VMess 流量可能被深度包检测 (DPI) 识别，若不添加额外混淆层
- 需要 V2Ray 兼容客户端（v2rayN、v2rayNG、Qv2ray 等）

## 测试要求

- **模板渲染测试**: 验证 `port`、`uuid` 正确渲染到配置文件模板；验证 `generated.uuid`（uuid_v4）正确生成；验证 `args` 正确传递
- **Mock 部署测试**: 验证完整 render -> deploy 链路，包括 JSON 配置文件写入和 `args` 传递到 Docker Cmd
- **Docker 部署测试** (tag: `dockertest`): 真实拉取 `v2fly/v2fly-core` 镜像，启动容器，验证 V2Ray 服务启动并监听指定端口
