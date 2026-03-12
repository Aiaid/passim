# User Stories

> 配合 [../rewrite-plan.md](../rewrite-plan.md) 使用

## 角色定义

Passim 的核心用户是有 VPS 但不想折腾命令行的普通人——可能是为了翻墙、远程办公、搭私有网盘，也可能只是想有一个属于自己的云。他们不是开发者，不懂 Docker，不想碰终端。

| 角色 | 描述 |
|------|------|
| **User** | 普通用户，通过 Passim Web UI 管理自己的 VPS，不需要技术背景 |
| **Power User** | 管理多台 VPS 的用户，使用远程节点管理和批量部署 |
| **Admin** | 平台管理员 (多用户场景，Phase 5) |
| **New User** | 首次接触平台的用户，需要清晰的引导从安装到第一次使用 |

## Epic 目录

| Epic | 文件 | Stories | 说明 |
|------|------|---------|------|
| 1 | [epic-1-node-lifecycle.md](./epic-1-node-lifecycle.md) | US-1.1 ~ US-1.9 | 节点完整生命周期 (安装/首次设置/状态/远程连接/更新/卸载) |
| 2 | [epic-2-containers.md](./epic-2-containers.md) | US-2.1 ~ US-2.3 | 容器管理 (列表/操作/日志) |
| 3 | [epic-3-app-deployment.md](./epic-3-app-deployment.md) | US-3.1 ~ US-3.7 | 应用部署 (模板/部署/批量/配置导出/卸载) |
| 4 | [epic-4-storage.md](./epic-4-storage.md) | US-4.1 | 存储管理 (S3 凭证) |
| 5 | [epic-5-auth.md](./epic-5-auth.md) | US-5.1 ~ US-5.4 | 认证 (API Key + Passkey + CLI 重置) |
| 6 | [epic-6-i18n.md](./epic-6-i18n.md) | US-6.1 | 多语言 |
| 7 | [epic-7-monitoring.md](./epic-7-monitoring.md) | US-7.1 ~ US-7.4 | 监控与可观测性 |
| 8 | [epic-8-admin.md](./epic-8-admin.md) | US-8.1 ~ US-8.2 | 系统管理 (Admin) |
| 9 | [epic-9-settings.md](./epic-9-settings.md) | US-9.1 ~ US-9.2 | 设置与个性化 (主题/安全) |
| 10 | [epic-10-mobile-app.md](./epic-10-mobile-app.md) | US-10.1 ~ US-10.6 | 手机 App (Expo，连接/管理/VPN 配置/通知) |

## 优先级矩阵

| 优先级 | User Story | Phase |
|--------|-----------|-------|
| **P0 - 必须** | US-1.1 安装 Passim | Phase 1 |
| **P0** | US-1.2 首次设置向导 | Phase 2 |
| **P0** | US-1.3 查看节点状态 | Phase 1 |
| **P0** | US-2.1 容器列表 | Phase 1 |
| **P0** | US-2.2 容器操作 | Phase 1+2 |
| **P0** | US-3.1 浏览模板 | Phase 1+2 |
| **P0** | US-3.2 部署应用 | Phase 1+2 |
| **P0** | US-3.5 导出配置 | Phase 2 |
| **P0** | US-5.1 API Key 认证 | Phase 1+2 |
| **P0** | US-5.2 Passkey 登录 | Phase 2 |
| **P1 - 重要** | US-1.4 添加远程节点 | Phase 3 |
| **P1** | US-1.5 管理远程连接 | Phase 3 |
| **P1** | US-1.6 删除远程节点 | Phase 3 |
| **P1** | US-3.3 批量部署 | Phase 3 |
| **P1** | US-5.3 Passkey 管理 | Phase 2 |
| **P1** | US-5.4 CLI 应急重置 | Phase 1 |
| **P1** | US-7.1 监控仪表盘 | Phase 2 |
| **P1** | US-6.1 多语言 | Phase 2 |
| **P1** | US-9.1 暗色模式 | Phase 2 |
| **P1** | US-9.2 安全设置 | Phase 2 |
| **P2 - 增强** | US-1.7 重命名节点 | Phase 3 |
| **P2** | US-1.8 更新 Passim | Phase 4 |
| **P2** | US-1.9 卸载 Passim | Phase 4 |
| **P2** | US-2.3 容器日志 | Phase 4 |
| **P2** | US-3.4 应用详情 | Phase 2 |
| **P2** | US-3.6 卸载应用 | Phase 2 |
| **P2** | US-3.7 更新配置 | Phase 4 |
| **P2** | US-4.1 S3 管理 | Phase 2 |
| **P2** | US-7.2 测速 | Phase 4 |
| **P2** | US-7.3 SSL 状态 | Phase 4 |
| **P2** | US-7.4 DNS 检查 | Phase 4 |
| **P1** | US-10.1 连接 Passim 节点 (App) | Phase 5 |
| **P1** | US-10.2 Dashboard 概览 (App) | Phase 5 |
| **P1** | US-10.3 应用管理与快捷操作 (App) | Phase 5 |
| **P0** | US-10.4 VPN 配置与扫码 (App) | Phase 5 |
| **P1** | US-10.6 Passkey 生物认证 (App) | Phase 5 |
| **P2** | US-10.5 推送通知 (App) | Phase 5 |
| **P3 - 后续** | US-8.1 用户管理 | Phase 5 |
| **P3** | US-8.2 全局概览 | Phase 5 |
