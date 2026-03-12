# Epic 6: 多语言

> Phase: 3 (P1)

---

## US-6.1 切换语言 `P1` `Phase 3`

**作为** 用户
**我想** 在中文和英文之间切换界面语言
**以便** 使用我熟悉的语言

**验收标准:**
- [ ] Header 右上角语言切换按钮 (DropdownMenu)
- [ ] 支持 en-US (English) / zh-CN (中文)
- [ ] 切换后立即生效，无需刷新 (next-intl locale 切换)
- [ ] 语言偏好保存到 Cookie (`NEXT_LOCALE`)，下次访问自动应用
- [ ] 首次访问根据浏览器 `Accept-Language` 自动选择
- [ ] 覆盖范围:
  - 所有 UI 文本 (导航/按钮/标签/提示)
  - 应用模板名称和描述
  - 连接教程 (howto)
  - 错误信息
  - 时间格式 (相对时间: "3 分钟前" / "3 minutes ago")

**技术实现:**
- `next-intl` + `middleware.ts` 处理 locale 检测
- 消息文件: `messages/en-US.json`, `messages/zh-CN.json`
- 应用模板 YAML 中 `description`/`label`/`howto` 字段均支持多语言 key

**前端交互:**
```
Header 右上角:
  [🌐 EN ▼]
    ├── English
    └── 中文
```
