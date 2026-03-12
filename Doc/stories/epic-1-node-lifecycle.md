# Epic 1: 节点生命周期

> Phase: 1 (P0) + Phase 3 (P1/P2)

---

## US-1.1 安装 Passim `P0` `Phase 1`

**作为** User
**我想** 在 VPS 上一行命令启动 Passim
**以便** 立即开始管理这台机器

**验收标准:**
- [ ] 一行命令启动:
  ```bash
  docker run -d --name passim --restart always \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v passim-data:/data -p 8443:8443 \
    passim/passim:latest
  ```
- [ ] 首次启动自动生成 API Key，通过 `docker logs passim` 查看
- [ ] 首次启动自动运行 setup: 部署 Speedtest + SWAG (SSL) 容器
- [ ] 启动完成后可通过 `https://<vps-ip>:8443` 访问 Web UI
- [ ] 启动时间 < 5s (不含 setup)
- [ ] 支持通过环境变量自定义节点名和 API Key

---

## US-1.2 查看节点状态 `P0` `Phase 1`

**作为** User
**我想** 看到 VPS 的实时系统状态
**以便** 了解资源使用情况

**验收标准:**
- [ ] Dashboard 显示: CPU 使用率、内存 (已用/总量)、磁盘 (已用/总量)、网络流量 (上行/下行)
- [ ] 数据每 5 秒自动刷新 (SSE 推送)
- [ ] 显示 CPU 核数、系统负载 (1/5/15 min)、系统版本
- [ ] 显示运行中/已停止的容器数量
- [ ] 显示已部署的应用列表和状态

---

## US-1.3 添加远程节点 `P1` `Phase 3`

**作为** User
**我想** 从当前 Passim 连接管理其他 VPS 上的 Passim
**以便** 在一个面板管理多台机器

**验收标准:**
- [ ] Dashboard "Remote Nodes" 区域 [+ Add Node] 按钮
- [ ] 弹窗填写: 地址 (host:port) + 目标 Passim 的 API Key + 可选名称
- [ ] 提交后自动建立 WebSocket 连接
- [ ] 连接成功后节点卡片显示 "🟢 Connected" + 基础指标
- [ ] 连接失败显示错误原因 (网络不通 / API Key 错误 / 超时)
- [ ] 断线自动重连

**前端交互:**
```
Dialog: Add Remote Node

  Address:  [vps-b.example.com:8443 ]
  API Key:  [●●●●●●●●●●●●●●●●●●●●  ]
  Name:     [tokyo-2            ] (可选)

  [Cancel]                      [Connect]

  --- 连接中 ---
  ⏳ Connecting to vps-b.example.com:8443...

  --- 连接成功 ---
  ✅ Connected! Node "tokyo-2" added.
```

---

## US-1.4 管理远程连接 `P1` `Phase 3`

**作为** User
**我想** 查看和管理谁连接了我 / 我连接了谁
**以便** 控制访问

**验收标准:**

**我连接的节点 (Outgoing):**
- [ ] Settings 页面显示所有远程节点列表
- [ ] 每个节点显示: 名称、地址、状态 (连接/断开)、添加时间
- [ ] 可断开/重连/删除远程节点

**连接我的节点 (Incoming):**
- [ ] Settings 页面显示谁正在远程管理本节点
- [ ] 显示: 来源 IP、连接时间
- [ ] 可断开某个连接 (踢出)

---

## US-1.5 重命名节点 `P2` `Phase 3`

**作为** User
**我想** 给本地或远程节点起一个有意义的名字
**以便** 快速识别

**验收标准:**
- [ ] 本地: Settings 页修改节点名
- [ ] 远程: 节点卡片上点击名字 inline edit
- [ ] 名字限制: 1-32 字符
- [ ] 修改立即生效
