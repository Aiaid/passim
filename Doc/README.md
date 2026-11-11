# Passim 文档入口

> 更新：2026-11-11  
> 产品方向与路线是规划文档；接口和功能是否可用，应结合当前代码与验证结果确认。

## 本轮产品方向

- [手机端优先与外部 Agent 接入](design/mobile-first-agent-direction.md)：定位、手机首页、持续任务状态、客户端分工、安全授权与待决定事项。
- [手机端与 Agent 路线](design/mobile-first-roadmap.md)：从一个可用场景开始，逐步完善任务记录、权限、接入与维护。

本轮优先强化手机端和 AI Agent 连接，Web 保留高级管理、配置与恢复职责。以上方向不表示统一任务中心、远程 MCP 或细粒度 Agent 授权已经实现。

## 现有设计与实现参考

| 范围 | 文档 |
|---|---|
| 整体架构 | [系统重写计划](rewrite-plan.md) |
| 服务与 API | [Passim 服务](spec-passim.md)、[API 版本](spec-api-versioning.md) |
| 客户端 | [手机 App](spec-app.md)、[Web](spec-web.md) |
| 手机端专题 | [多节点应用](spec-app-multi-node.md)、[部署目标](spec-mobile-deploy-targets.md)、[容器工具](spec-mobile-container-tools.md) |
| Agent 接入 | [MCP 服务](spec-mcp-server.md) |
| 部署与节点 | [模板](spec-templates.md)、[Stack](spec-stacks.md)、[节点邀请](spec-invite.md) |
| 工程与基础设施 | [CI/CD](spec-cicd.md)、[DNS](spec-dns.md)、[测试盘点](test-inventory.md) |
| 用户需求 | [用户故事](stories/README.md) |

既有文档中的技术版本、阶段和完成状态需要持续核对。本轮方向不自动替代尚未修订的 API 规格；新增工作应先补充具体设计与验收。

新文档按主题放入子目录，并维护入口。更新既有文档时保留有用背景，注明已被取代的内容，不把研究结论写成上线承诺。
