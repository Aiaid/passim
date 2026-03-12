# Epic 4: 存储管理

> Phase: 3 (P2)

---

## US-4.1 管理 S3 凭证 `P2` `Phase 3`

**作为** 用户
**我想** 添加/编辑/删除 S3 兼容存储的凭证
**以便** 用于备份或文件存储

**验收标准:**
- [ ] 添加: 填写名称、Endpoint URL、Bucket、Access Key、Secret Key
- [ ] 列表显示所有凭证 (Secret Key 部分隐藏: `sk-****abcd`)
- [ ] 编辑: 可修改所有字段
- [ ] 删除: 确认对话框
- [ ] [Test Connection] 按钮: 验证凭证有效性 → 显示成功/失败 Toast

**前端交互:**

```
S3 Storage                                     [+ Add S3]

┌──────────────────────────────────────────────────────┐
│ my-backup                                    [⋮]     │
│                                                      │
│ Endpoint:   s3.amazonaws.com                         │
│ Bucket:     passim-backup-2026                       │
│ Access Key: AKIA*****EXAMPLE                         │
│ Secret Key: ●●●●●●●●●●●●                            │
│                                                      │
│ Last tested: ✅ OK (2026-03-10)                      │
└──────────────────────────────────────────────────────┘

[+ Add S3] → Dialog:
  ┌──────────────────────────────────────────┐
  │ Add S3 Credential                        │
  │                                          │
  │ Name:       [my-backup              ]    │
  │ Endpoint:   [s3.amazonaws.com       ]    │
  │ Bucket:     [passim-backup-2026     ]    │
  │ Access Key: [AKIA...                ]    │
  │ Secret Key: [●●●●●●●●              ]    │
  │                                          │
  │ [Test Connection]                        │
  │                                          │
  │ [Cancel]                        [Save]   │
  └──────────────────────────────────────────┘
```
