# Epic 5: 认证

> Phase: 1+2 (P0)

---

## US-5.1 API Key 认证 `P0` `Phase 1+2`

**作为** User
**我想** 用 API Key 登录 Passim Web UI
**以便** 安全访问管理面板

**验收标准:**
- [ ] Passim 首次启动生成 API Key，输出到 Docker 日志
- [ ] 登录页: 输入 API Key → 验证 → 签发 JWT (有效期 7 天)
- [ ] JWT 存储在 localStorage，自动附加到所有请求
- [ ] 7 天到期前可 refresh 续期
- [ ] 支持通过环境变量预设 API Key: `-e PASSIM_AUTH_API_KEY=xxx`
- [ ] API Key 错误时显示 "Invalid API Key"
- [ ] 可在 Settings 页面重置 API Key (旧 Key 立即失效)

**前端交互:**
```
Passim

┌──────────────────────────────────────┐
│ API Key: [                         ] │
│                                      │
│ [ Enter                            ] │
│                                      │
│ Run `docker logs passim` to see     │
│ your API key                        │
└──────────────────────────────────────┘
```

**技术备注:**
- 不使用 NextAuth — 直接 JWT
- 未来 Phase 5 可扩展为多用户 (邮箱+密码 + RBAC)
- 远程节点通信使用 API Key 直接认证 (不走 JWT)
