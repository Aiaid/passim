# API 版本兼容性方案（草案）

> 状态：**待定** — 当前阶段不实施，等架构更成熟后再推进。

## 问题

Mobile app 可连接多个远程节点，各节点可能运行不同版本的 Passim。当前没有 API 兼容性协商机制：

- 节点版本不一致：节点 A 跑 v1.2、节点 B 跑 v1.3，某些 API 在旧版本不存在
- 客户端版本落后：后端改了 API schema，旧 app 请求报错
- 客户端版本领先：app 调用新 API，旧节点返回 404

## 现状

- API 无版本前缀，统一 `/api/*`
- `/api/version` 仅返回 `{version, commit, build_time}`
- Mobile app 不做兼容性检查，直接调用 API

## 初步方案

### 扩展 `/api/version` 响应

```json
{
  "version": "v1.3.0",
  "commit": "abc1234",
  "build_time": "...",
  "api_version": 3,
  "min_client_version": "0.2.0",
  "capabilities": ["wireguard", "storage", "remote-desktop", "share-links"]
}
```

| 字段 | 用途 |
|------|------|
| `api_version` | 整数，单调递增，API schema 有破坏性变更时 +1 |
| `min_client_version` | 最低支持的客户端版本，低于此版本提示更新 |
| `capabilities` | 功能列表，客户端据此动态显示/隐藏功能 |

### 客户端行为

1. 连接节点时先请求 `/api/version`，缓存结果
2. 检查 `api_version` 是否在客户端支持的范围内
3. 检查客户端版本是否 >= `min_client_version`
4. 不兼容时提示用户更新 app 或节点
5. 用 `capabilities` 做优雅降级 — 功能不支持就隐藏，不报错

### 不采用 URL 版本化

`/api/v1/`、`/api/v2/` 对自托管单用户场景过度工程化，维护多版本路由成本高，不适合当前项目规模。

## 待明确

- `api_version` 何时 bump、谁来 bump（手动 vs CI 检测）
- capabilities 列表的粒度（按大功能 vs 按端点）
- 是否需要版本协商 header（如 `Accept-API-Version`）
- 旧节点（不支持新字段的）如何兼容
