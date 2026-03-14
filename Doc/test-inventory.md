# Test Inventory

> 最后更新: 2026-03-14 | 总测试: **322** (Go 192 + Frontend 130) | 全部通过

## 运行命令

```bash
# Go 后端 — 全部测试
cd passim && go test ./... -count=1

# Go 后端 — Race detection
cd passim && go test -race ./...

# Go 后端 — 覆盖率
cd passim && go test -cover ./...

# 前端 — 全部测试
cd web && pnpm test:run

# 前端 — Watch 模式
cd web && pnpm test

# 前端 — 覆盖率
cd web && pnpm test:coverage
```

---

## Go 后端 (passim/)

**33 test files, 192 top-level test functions, 277 test runs (含子测试)**

### internal/api/ — API 层 (13 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `auth_test.go` | LoginSuccess, LoginWrongKey, LoginMissingKey, RefreshSuccess, RefreshInvalidToken | 密码认证 + JWT 刷新 |
| `middleware_test.go` | MiddlewareValidToken, MiddlewareInvalidToken, MiddlewareNoToken, MiddlewareRevokedToken, MiddlewareQueryParamToken, MiddlewareQueryParamTokenInvalid, MiddlewareQueryParamTokenRevoked | JWT 中间件 + query param token |
| `container_test.go` | ListContainers, StartContainer, StopContainer, RestartContainer, RemoveContainer, ContainerLogs, Containers_RequireAuth (7 subtests) | 容器 CRUD |
| `app_test.go` | DeployApp, DeployApp_DefaultSettings, DeployApp_InvalidSettings, DeployApp_NoAuth, DeployApp_TemplateNotFound, ListApps_Empty, GetApp_NotFound, DeleteApp_NotFound, AppConfigs, AppConfigs_NoConfigs | 应用部署 + 管理 |
| `passkey_test.go` | PasskeyExistsEmpty, PasskeyExistsWithPasskey, PasskeyBeginRegisterRequiresAuth, PasskeyBeginRegisterSuccess, PasskeyBeginLoginNoPasskeys, PasskeyFinishLoginNoPasskeys, PasskeyDeleteNotFound, PasskeyDeleteSuccess, PasskeyListEmpty, PasskeyListWithPasskeys, PasskeyProtectedRoutesRequireAuth (4 subtests), PasskeyRoutesNotRegisteredWithoutWebAuthn (3 subtests) | Passkey WebAuthn API |
| `static_test.go` | StaticServesIndexHTML, StaticServesAsset, StaticSPAFallback, StaticAPIRouteReturns404JSON, StaticFavicon | SPA 静态文件服务 |
| `events_test.go` | AppEvents_WithSSE, TaskEvents_WithSSE, TaskEvents_NoSSE | SSE 事件推送 |
| `status_test.go` | PingHandler, Status_NoDocker, Status_ReturnsFullStructure | 系统状态 |
| `template_test.go` | ListTemplates, ListTemplatesRequiresAuth | 模板列表 |
| `task_test.go` | GetTask, GetTask_NotFound, ListTasks, ListTasks_Empty, ListTasks_RequiresAuth, ListTasks_WithTasks | 任务查询 |
| `ssl_test.go` | SSLStatusEndpoint, SSLRenewEndpoint_SelfSigned | SSL 状态 |
| `speedtest_test.go` | SpeedtestDownloadEndpoint, SpeedtestUploadEndpoint, SpeedtestPingEndpoint | 测速 |
| `testhelper_test.go` | — | 测试辅助函数 (testServer, getToken 等) |

### internal/auth/ — 认证层 (3 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `jwt_test.go` | IssueAndVerify, VerifyExpired, VerifyWrongSecret, AuthVersionInClaims | JWT 签发与验证 |
| `apikey_test.go` | GenerateAPIKey, VerifyAPIKey, HashDeterministic | API Key 生成与校验 |
| `webauthn_test.go` | NewWebAuthnManager, NewWebAuthnManagerInvalid, PassimUserInterface, BeginRegistration, FinishRegistrationNoChallenge, BeginLogin, FinishLoginNoChallenge | WebAuthn 管理器生命周期 |

### internal/db/ — 数据层 (2 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `queries_test.go` | InitFirstTime, InitIdempotent, InsertAndGet, GetNonexistent, ConfigRoundTrip, AppLifecycle, AppCRUD, GetApp_NotFound | SQLite 数据操作 |
| `passkey_test.go` | PasskeyCRUD, CreatePasskey_DuplicateCredentialID, GetPasskey_NotFound | Passkey 存储 |

### internal/docker/ — Docker 层 (2 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `client_test.go` | MockClient_ImplementsInterface, MockClient_ListContainers, MockClient_ListContainers_Error, MockClient_StartContainer, MockClient_StopContainer, MockClient_RestartContainer, MockClient_RemoveContainer, MockClient_ContainerLogs, MockClient_Close, MockClient_Ping, ListContainers_DockerError, ListContainers_DockerUnavailable | Docker SDK Mock |
| `deploy_test.go` | Deploy_Success, Deploy_PullFails, Deploy_NilClient, Undeploy | 容器部署引擎 |

### internal/template/ — 模板引擎 (5 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `parser_test.go` | ParseMinimalYAML, ParseCompleteYAML, ParseInvalidYAML (3 subtests) | YAML 解析 |
| `validate_test.go` | ValidateSettingsValid, ValidateSettingsRequiredMissing, ValidateSettingsInvalidType (3), ValidateSettingsOutOfRange (4), ValidateSettingsSelectOption (2), ValidateSettingsPatternMatch (2), ValidateSettingsDefaultsApplied, ValidateSettingsNumericTypes | 设置校验 |
| `generate_test.go` | GenerateRandomStringLength (4), GenerateRandomStringUniqueness, GenerateUUIDFormat, GenerateUUIDUniqueness, GenerateRandomPort, GenerateRandomPortUnique, GenerateSecret, GenerateMultipleSpecs, GenerateUnknownType | 值生成器 |
| `render_test.go` | RenderVariableSubstitution, RenderNoPlaceholders, RenderMissingVariable, RenderNodeVariables, RenderConfigFiles, WriteConfigFiles | 模板渲染 |
| `templates_test.go` | RegistryLoadsAllTemplates, AllTemplatesParseSuccessfully, AllTemplatesHaveRequiredFields (7), AllTemplatesHaveLocalizedLabels (7), AllTemplatesHaveSourceAndGuide (7), AllTemplatesGenerateValues (7), AllTemplatesValidateWithDefaults (7), TemplateCategories, TemplateContainerImages, TemplatesWithArgs (3), TemplatesWithCapAdd (2), TemplatesWithConfigFiles (2), 以及 7 个具体模板测试 | 7 个应用模板集成测试 |

### 其他包 (6 files)

| File | Tests | 覆盖模块 |
|------|-------|---------|
| `metrics/collector_test.go` | Collect_ReturnsNonZeroValues, Collect_CPUModelNotEmpty, Collect_MemoryUsageReasonable, Collect_DiskUsageReasonable | 系统指标采集 |
| `setup/setup_test.go` | GenerateRandomStringLength, CollectSANs | 初始化 |
| `speedtest/http_test.go` | DownloadHandler_DefaultSize, DownloadHandler_CustomSize, DownloadHandler_InvalidSize, UploadHandler, UploadHandler_EmptyBody, ParseSize (10 subtests) | 测速 HTTP 处理 |
| `sse/broker_test.go` | SubscribeAndPublish, PublishNoSubscribers, PublishToCorrectTopic, MultipleTopics, Unsubscribe, ConcurrentPublish, DropEventsWhenFull, SSEEventFormat, MetricsStream, MetricsStream_NoAuth | SSE Broker |
| `ssl/selfsigned_test.go` | GenerateSelfSigned, GenerateSelfSigned_SANs, GenerateSelfSigned_SubDir, GenerateSelfSigned_ValidCert | 自签名证书 |
| `ssl/manager_test.go` | SSLManager_SelfSigned_Init, SSLManager_SelfSigned_InitIdempotent, SSLManager_SelfSigned_Status, SSLManager_SelfSigned_GetTLSConfig, SSLManager_Custom_Exists, SSLManager_Custom_Missing, SSLManager_Auto_Stub, SSLManager_StatusBeforeInit, SSLManager_UnknownMode | SSL 管理器 |
| `task/queue_test.go` | EnqueueAndProcess, MaxRetriesExceeded, RetryOnFailure, RecoverPending, UpdateStatus, UpdateStatusFailed | 任务队列 |
| `task/store_test.go` | EventFormat (2 subtests) | 任务存储 |

---

## 前端 (web/)

**20 test files, 130 tests | Vitest + jsdom + Testing Library**

### 测试基础设施

| File | 用途 |
|------|-----|
| `vitest.config.ts` | 继承 vite.config (路径别名), jsdom 环境, globals |
| `src/test/setup.ts` | matchMedia / EventSource / ResizeObserver / navigator.credentials / URL mock |
| `src/test/test-utils.tsx` | 封装 render() + QueryClientProvider + MemoryRouter |

### src/lib/ — 工具函数 (3 files, 27 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `utils.test.ts` | 15 | formatBytes (4), formatUptime (4), localized (5), cn (2) |
| `api-client.test.ts` | 10 | Token 注入, Content-Type, 200/204/401/500 处理, ApiError |
| `webauthn-utils.test.ts` | 2 | base64url ↔ ArrayBuffer round-trip |

### src/stores/ — 状态管理 (2 files, 10 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `auth-store.test.ts` | 5 | 初始状态, login/logout + localStorage 同步 |
| `preferences-store.test.ts` | 5 | 默认值, setTheme, setLanguage, toggleSidebar |

### src/hooks/ — 自定义 Hooks (2 files, 13 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `use-sse.test.ts` | 9 | URL 构建, onopen/onmessage/onerror, 重连, enabled/token 守卫, unmount 清理 |
| `use-metrics-stream.test.ts` | 4 | 初始状态, 单条数据, 60 条缓冲溢出, latest 值 |

### src/features/auth/ — 认证 (2 files, 10 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `login-form.test.tsx` | 6 | 渲染, 空提交校验, 有值提交, 成功导航, 失败处理, loading 状态 |
| `passkey-login.test.tsx` | 4 | exists=false/loading 不渲染, exists=true 渲染, 按钮可点击 |

### src/features/dashboard/ — 仪表盘 (2 files, 9 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `container-summary.test.tsx` | 7 | 名称 strip /, skeleton, 空状态, max 5, running count, 导航按钮 |
| `metrics-chart.test.tsx` | 2 | memory bytes→%, memory_total=0 防除零 |

### src/features/containers/ — 容器管理 (2 files, 10 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `container-list.test.tsx` | 7 | state 映射 (exited→stopped), 名称 strip, 镜像截断, 行数, 无名回退 |
| `container-actions.test.tsx` | 3 | running: Stop+Restart, stopped: Start+Remove, Logs 始终可见 |

### src/features/marketplace/ — 应用市场 (3 files, 31 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `dynamic-form.test.tsx` | 19 | isGenerated (2), schema 校验 (5), defaults (3), 6 种字段渲染, advanced 折叠 (2), submit strip 空值 |
| `deploy-progress.test.tsx` | 8 | statusToProgress 映射 (4), done/failed/pending/running UI |
| `marketplace-page.test.tsx` | 4 | 分类过滤, 搜索, all, 组合过滤 |

### src/features/settings/ — 设置 (2 files, 14 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `ssl-settings.test.tsx` | 8 | isExpiringSoon (2), formatDate (2), loading, 无 SSL, valid/invalid 状态 |
| `passkey-list.test.tsx` | 6 | 零时间, 空列表, 表格渲染, "从未使用", 删除按钮, loading |

### src/features/apps/ — 应用管理 (2 files, 6 tests)

| File | Tests | 覆盖内容 |
|------|-------|---------|
| `app-events.test.tsx` | 4 | connected/disconnected 指示器, 空状态, 事件倒序累积 |
| `undeploy-dialog.test.tsx` | 2 | confirm 调 deleteApp, destructive 样式 |

---

## 测试覆盖进展

| 阶段 | Go 文件 | Go 测试 | 前端文件 | 前端测试 | 状态 |
|------|---------|---------|---------|---------|------|
| Phase 1 (后端核心) | 28 | 177 | — | — | ✅ 完成 |
| Phase 2 (WebAuthn + Web UI) | 5 | 15 | 20 | 130 | ✅ 完成 |
| Phase 3 (远程节点) | — | — | — | — | 📋 计划中 |
| Phase 4 (DNS 集成) | — | — | — | — | 📋 计划中 |
| Phase 5 (移动端) | — | — | — | — | 📋 计划中 |

---

## 待改进

- [ ] Go 后端: 集成测试 (`-tags=integration`) 覆盖 API→DB→Docker 全链路
- [ ] Go 后端: E2E 测试 (`-tags=e2e`) 覆盖真实 HTTP 请求
- [ ] 前端: 覆盖率报告 + 覆盖率门槛设置
- [ ] 前端: E2E 测试 (Playwright) 覆盖完整用户流程
- [ ] CI/CD: GitHub Actions 自动化测试流水线
