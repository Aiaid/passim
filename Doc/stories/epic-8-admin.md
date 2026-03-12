# Epic 8: 系统管理 (Admin)

> Phase: 5 (P3)

---

## US-8.1 用户管理 `P3` `Phase 5`

**作为** Admin
**我想** 查看和管理所有用户
**以便** 控制平台访问

**验收标准:**
- [ ] 用户列表表格:
  - 邮箱
  - 角色 (User / Admin)
  - 节点数量 (已用 / 配额)
  - 注册时间
  - 最后登录时间
  - 状态 (活跃 / 禁用)
- [ ] 可修改用户角色 (User ↔ Admin)
- [ ] 可修改用户配额 (最大节点数)
- [ ] 可禁用/启用用户 (禁用后无法登录)
- [ ] 搜索: 按邮箱搜索
- [ ] 不可修改自己的角色 (防止误操作锁死)

**前端交互:**
```
User Management                              [Search: ___]

┌──────────────────┬───────┬───────┬─────────────┬────────┬──────┐
│ Email            │ Role  │ Nodes │ Registered  │ Last   │ Act. │
├──────────────────┼───────┼───────┼─────────────┼────────┼──────┤
│ alice@email.com  │ Admin │ 3/10  │ 2026-01-15  │ 2h ago │  ⋮  │
│ bob@email.com    │ User  │ 2/5   │ 2026-02-20  │ 1d ago │  ⋮  │
│ carol@email.com  │ User  │ 0/5   │ 2026-03-01  │ never  │  ⋮  │
└──────────────────┴───────┴───────┴─────────────┴────────┴──────┘

⋮ → DropdownMenu:
  Edit Quota
  Change Role → User / Admin
  ── separator ──
  Disable Account
```

---

## US-8.2 全局概览 `P3` `Phase 5`

**作为** Admin
**我想** 看到平台全局统计
**以便** 了解平台运营状态

**验收标准:**
- [ ] 统计卡片:
  - 总用户数 (较昨日 +N)
  - 总节点数 / 在线节点数
  - 总应用部署数
  - 总容器数 / 运行中
- [ ] 最近 24h:
  - 新增用户数
  - 新增节点数
  - 部署操作次数
- [ ] 节点地理分布 (可选):
  - 按国家分组的节点数量
  - 饼图或简单列表

**前端交互:**
```
Admin Dashboard

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ 12 Users   │ │ 28 Nodes   │ │ 45 Apps    │ │ 89 Cont.   │
│ +2 today   │ │ 25 online  │ │ deployed   │ │ 78 running │
└────────────┘ └────────────┘ └────────────┘ └────────────┘

Last 24h Activity
  • 2 new users registered
  • 5 new nodes added
  • 12 deployment operations

Nodes by Region
  🇯🇵 Japan:     8 nodes
  🇺🇸 USA:       6 nodes
  🇩🇪 Germany:   5 nodes
  🇸🇬 Singapore: 4 nodes
  Others:       5 nodes
```
