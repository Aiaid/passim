# Epic 7: 监控与可观测性

> Phase: 3 (P1) + Phase 4 (P2)

---

## US-7.1 节点监控仪表盘 `P1` `Phase 3`

**作为** Power User
**我想** 在一个页面总览所有节点的健康状态
**以便** 快速发现异常

**验收标准:**
- [ ] Dashboard 首页显示所有节点卡片
- [ ] 每张卡片信息: 名称、IP、国家 (旗帜 emoji)、状态 (在线/离线)
- [ ] 在线卡片显示: CPU/内存使用率进度条、应用数量、容器数量
- [ ] 离线节点:
  - 用灰色/红色边框标识
  - 排列在列表最前
  - 显示 "Last seen: xx ago"
- [ ] 点击卡片 → 进入节点详情页
- [ ] 总览统计: 总节点数 / 在线 / 离线 / 总应用数 / 总容器数

---

## US-7.2 测速 `P2` `Phase 4`

**作为** 用户
**我想** 对 VPS 进行网络测速
**以便** 了解网络质量

**验收标准:**

**浏览器 → VPS 测速 (内置 HTTP 端点):**
- [ ] 节点详情页 "Speedtest" 区域
- [ ] 显示最近一次测速结果:
  - 下载速度 (Mbps) — `GET /api/speedtest/download`
  - 上传速度 (Mbps) — `POST /api/speedtest/upload`
  - 延迟 Ping (ms) / 抖动 Jitter (ms) — `GET /api/speedtest/ping`
- [ ] [Run Speedtest] 按钮触发新测速
- [ ] 测速进行中显示实时进度 (下载 → 上传 → Ping)
- [ ] 测速历史记录 (简单表格，最近 10 次)

**节点 ↔ 节点测速 (iperf3):**
- [ ] 远程节点详情页显示 [Test Throughput] 按钮
- [ ] 使用 iperf3 测试本机与远程节点之间的吞吐量
- [ ] 测速结果: 下载 / 上传 (Mbps)
- [ ] 测速过程通过 SSE 推送实时进度

**技术实现:**
- 浏览器测速: Go 内置 HTTP 端点 (download 返回随机数据流，upload 接收数据计算速度，ping 返回时间戳)
- 节点间测速: iperf3 (每个 Passim 内置 iperf3 server，监听 :5201)
- 不再使用独立 Speedtest 容器

**前端交互:**
```
Speedtest                          [Run Speedtest]

┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
│ ↓ Download │ │ ↑ Upload   │ │ Ping     │ │ Jitter   │
│   856 Mbps │ │   421 Mbps │ │   3.2 ms │ │   0.8 ms │
└────────────┘ └────────────┘ └──────────┘ └──────────┘

Last tested: 2026-03-12 10:30

Node-to-Node Throughput            [Test Throughput]
┌────────────────────────────────────────────────────┐
│  tokyo-1 ↔ us-west:  ↓ 892 Mbps  ↑ 445 Mbps      │
│  Tested: 2026-03-12 09:15                          │
└────────────────────────────────────────────────────┘
```

---

## US-7.3 SSL 证书状态 `P2` `Phase 4`

**作为** 用户
**我想** 看到每台 VPS 的 SSL 证书状态
**以便** 确保 HTTPS 正常

**验收标准:**
- [ ] 节点详情 Services 区域显示 SSL 状态:
  - ✅ Valid (expires 2026-06-15) — auto/custom 模式
  - ⚠️ Expiring Soon (< 7 days)
  - ❌ Expired
  - 🔒 Self-Signed — self-signed 模式
  - ⬜ Not Configured
- [ ] 显示当前 SSL 模式 (auto / self-signed / custom)
- [ ] auto 模式显示: 域名、证书颁发者 (Let's Encrypt)、到期日期、自动续期状态
- [ ] 即将过期 (< 7 天) 时: 黄色 Badge 警告
- [ ] [Renew Certificate] 按钮: 手动触发 certmagic 续期 (auto 模式)
- [ ] [Upload Certificate] 按钮: 上传自定义证书 (切换到 custom 模式)
- [ ] 续期过程显示进度

**技术实现:**
- 使用 certmagic 内置 ACME 客户端 (替代 SWAG 容器)
- auto 模式: certmagic 自动管理 Let's Encrypt 证书，到期前 30 天自动续期
- self-signed 模式: Go 内置生成自签证书 (用于 LAN/dev 环境)
- custom 模式: 用户上传自己的证书

---

## US-7.4 DNS 健康检查 `P2` `Phase 4`

**作为** 用户
**我想** 看到 DNS 解析是否正常
**以便** 确保域名可访问

**验收标准:**
- [ ] 节点详情 Services 区域显示 DNS 状态:
  - ✅ OK — 解析结果与节点 IP 匹配
  - ❌ Mismatch — 解析 IP 不匹配 (显示期望 vs 实际)
  - ❌ Failed — 解析失败 (超时/NXDOMAIN)
- [ ] 显示解析的完整域名 (Base32 编码的)
- [ ] 解析失败时显示排查建议:
  - "检查 DNS 服务器是否运行"
  - "检查 BASE_DOMAIN 配置"
  - "检查网络连接"
