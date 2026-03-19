# CI/CD 与版本管理设计

> 版本: 1.0 | 日期: 2026-03-17

## 一、目标

| 优先级 | 目标 | 说明 |
|--------|------|------|
| P0 | 自动化测试 | 每次 push / PR 自动跑 Go + 前端测试，通过才能合并 |
| P0 | 自动构建 Docker 镜像 | tag 推送后自动构建多架构镜像并发布到 registry |
| P1 | 语义化版本 | Git tag 驱动版本号，构建时注入二进制 |
| P1 | 自我更新 | Passim 容器内检测新版本、拉取镜像、重启自身 |
| P2 | Changelog 自动生成 | 从 commit 历史生成发布说明 |

---

## 二、版本策略

### 版本格式

采用 [语义化版本 2.0](https://semver.org/lang/zh-CN/):

```
v{MAJOR}.{MINOR}.{PATCH}[-{PRE}]

v1.0.0        # 首个正式版
v1.1.0        # 新功能 (向后兼容)
v1.1.1        # Bug 修复
v2.0.0        # 破坏性变更
v1.2.0-rc.1   # 预发布
```

### 版本注入

通过 Go 的 `-ldflags` 在编译时注入版本信息，不在代码中硬编码:

```go
// internal/version/version.go
package version

var (
    Version   = "dev"       // v1.2.3，构建时注入
    Commit    = "unknown"   // git short SHA
    BuildTime = "unknown"   // ISO 8601
)
```

构建命令:

```bash
go build -ldflags "-X github.com/passim/passim/internal/version.Version=v1.2.3 \
                   -X github.com/passim/passim/internal/version.Commit=$(git rev-parse --short HEAD) \
                   -X github.com/passim/passim/internal/version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
         -o passim ./cmd/passim/
```

### 版本查询

新增 API 端点和 CLI flag:

```
GET /api/version → { "version": "v1.2.3", "commit": "abc1234", "build_time": "..." }
passim --version → passim v1.2.3 (abc1234) built 2026-03-17T10:00:00Z
```

### Git Tag 规范

- 只在 `main` 分支打 tag
- tag 格式: `v{MAJOR}.{MINOR}.{PATCH}`
- tag 必须是 annotated tag (带签名或说明)

```bash
git tag -a v1.0.0 -m "release: v1.0.0 — 首个正式版"
git push origin v1.0.0
```

---

## 三、分支策略

采用 **简化 trunk-based** 模型，适合个人/小团队项目:

```
main ─────●────●────●────●────●──── (始终可部署)
           \       /
            feature-x    (短命分支，PR 合并后删除)
```

| 分支 | 用途 | 保护规则 |
|------|------|----------|
| `main` | 主干，始终可部署 | 必须通过 CI，禁止 force push |
| `feature/*` | 功能开发 | PR 合并到 main |
| `fix/*` | Bug 修复 | PR 合并到 main |

不设 develop / staging 分支 — 单容器项目不需要复杂的分支模型。

---

## 四、CI 流水线 (GitHub Actions)

### 4.1 测试流水线 — `ci.yml`

**触发条件**: push 到 `main`、所有 PR

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ── Go 后端测试 ──────────────────────────────────────
  go-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: passim
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: passim/go.sum

      - name: Unit tests
        run: go test -race -cover ./...

      - name: Integration tests
        run: go test -tags=integration -race ./...

  # ── 前端测试 ─────────────────────────────────────────
  web-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml

      - run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm lint
      - name: Type check
        run: pnpm tsc -b
      - name: Unit tests
        run: pnpm vitest run

  # ── Docker 构建测试 ──────────────────────────────────
  docker-build:
    runs-on: ubuntu-latest
    needs: [go-test, web-test]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: passim/Dockerfile
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 4.2 发布流水线 — `release.yml`

**触发条件**: 推送 `v*` tag

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write    # 创建 GitHub Release
  packages: write    # 推送到 GHCR

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository_owner }}/passim

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # changelog 需要完整历史

      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3

      # ── 登录 Registry ──────────────────────────────
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 可选: Docker Hub
      # - uses: docker/login-action@v3
      #   with:
      #     username: ${{ secrets.DOCKERHUB_USERNAME }}
      #     password: ${{ secrets.DOCKERHUB_TOKEN }}

      # ── 提取版本元数据 ─────────────────────────────
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=sha,prefix=

      # ── 多架构构建 + 推送 ──────────────────────────
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: passim/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VERSION=${{ github.ref_name }}
            COMMIT=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ── 生成 Changelog ─────────────────────────────
      - name: Generate changelog
        id: changelog
        run: |
          # 找到上一个 tag
          PREV_TAG=$(git tag --sort=-v:refname | head -n 2 | tail -1)
          if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "${{ github.ref_name }}" ]; then
            PREV_TAG=$(git rev-list --max-parents=0 HEAD)
          fi
          {
            echo "CHANGELOG<<EOF"
            git log ${PREV_TAG}..${{ github.ref_name }} \
              --pretty=format:"- %s (%h)" \
              --no-merges
            echo ""
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      # ── 创建 GitHub Release ────────────────────────
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: |
            ## 安装

            **一键安装** (自动装 Docker + DNS 反射器自动 HTTPS，无需域名):

            ```bash
            curl -fsSL https://raw.githubusercontent.com/anend-s-cat/passim/main/install.sh | sudo bash
            ```

            **或直接拉取镜像:**

            ```bash
            docker pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }}
            ```

            ## 更新

            ${{ steps.changelog.outputs.CHANGELOG }}
          generate_release_notes: false
```

### 4.3 Dockerfile 改造

在 Go 构建阶段接受版本参数:

```dockerfile
# Stage 2: Go build
FROM golang:1.25-alpine AS backend
ARG VERSION=dev
ARG COMMIT=unknown
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY passim/go.mod passim/go.sum ./passim/
RUN --mount=type=cache,target=/go/pkg/mod \
    cd passim && go mod download
COPY passim/ ./passim/
COPY --from=frontend /web/dist ./passim/cmd/passim/dist/
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    cd passim && CGO_ENABLED=1 go build \
      -ldflags "-X github.com/passim/passim/internal/version.Version=${VERSION} \
                -X github.com/passim/passim/internal/version.Commit=${COMMIT} \
                -X github.com/passim/passim/internal/version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -o /passim ./cmd/passim/
```

---

## 五、多架构构建

VPS 可能是 `amd64` 或 `arm64`，镜像必须支持两种架构。

| 架构 | 场景 |
|------|------|
| `linux/amd64` | 大部分云 VPS (Vultr, DO, Hetzner, Lightsail) |
| `linux/arm64` | AWS Graviton, Oracle Cloud Ampere, 树莓派 |

CI 使用 `docker buildx` + QEMU 交叉编译。Go 的 CGO (SQLite) 需要对应架构的 musl 工具链，Alpine 的 `gcc musl-dev` 在 QEMU 下可直接工作。

---

## 六、Docker Registry 策略

| Registry | 用途 | 镜像路径 |
|----------|------|----------|
| **GHCR** (主) | GitHub 原生，免费私有仓库 | `ghcr.io/anend-s-cat/passim:v1.0.0` |
| **Docker Hub** (可选) | 用户拉取便捷，无需指定 registry | `passim/passim:v1.0.0` |

### Tag 策略

每次 release 推送多个 tag:

```
v1.2.3       # 精确版本
v1.2         # minor 浮动 (自动跟踪最新 patch)
v1           # major 浮动
latest       # 最新稳定版 (仅正式版，不含 rc/beta)
abc1234      # commit SHA
```

用户根据需求选择:
- 生产环境: `passim/passim:v1.2.3` (锁定版本)
- 自动更新: `passim/passim:v1` (同 major 内自动更新)

---

## 七、自我更新机制

Passim 需要在容器内检测和执行自我更新。这是面向普通用户的核心体验 — 用户不应该需要 SSH 到服务器手动拉镜像。

### 更新检测

```
GET /api/version/check → {
  "current":  "v1.2.3",
  "latest":   "v1.3.0",
  "available": true,
  "changelog": "...",
  "published_at": "2026-03-17T10:00:00Z"
}
```

检测来源: GitHub Releases API (`GET https://api.github.com/repos/{owner}/passim/releases/latest`)

检测频率: 启动后立即检查，之后每 24 小时检查一次。

### 更新流程

```
用户点击 "更新" 按钮
     │
     ▼
Passim 通过 Docker SDK 执行:
  1. docker pull passim/passim:v1.3.0
  2. 检查镜像完整性
  3. 用新镜像重建当前容器 (保留 volumes + env + ports)
  4. 启动新容器
  5. 健康检查通过 → 删除旧容器
  6. 健康检查失败 → 回滚到旧镜像
```

**安全约束**:
- 更新需要用户在 Web UI 确认，不静默自动更新
- 跨 major 版本更新需额外确认 (可能有破坏性变更)
- 保留上一个版本的镜像，支持一键回滚

### 前端集成

设置页显示:
- 当前版本 / 最新版本
- "检查更新" 按钮
- 更新可用时显示 changelog + "更新" 按钮
- 更新进度条 (拉取镜像 → 重启 → 健康检查)

---

## 八、Commit 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/):

```
<type>(<scope>): <subject>

feat(auth):     add Passkey login support
fix(docker):    handle container restart race condition
docs(spec):     add CI/CD design spec
test(api):      add integration tests for /api/apps
refactor(db):   extract migration logic
chore(ci):      update Go version in workflow
```

| Type | 说明 | 版本影响 |
|------|------|----------|
| `feat` | 新功能 | minor bump |
| `fix` | Bug 修复 | patch bump |
| `docs` | 文档 | 无 |
| `test` | 测试 | 无 |
| `refactor` | 重构 | 无 |
| `chore` | 构建/CI/依赖 | 无 |
| `BREAKING CHANGE` | 破坏性变更 (footer) | major bump |

---

## 九、环境矩阵

| 环境 | 触发 | 镜像 tag | 用途 |
|------|------|----------|------|
| **dev** | 本地 `docker compose up` | 本地构建 | 开发调试 |
| **CI** | push / PR | 不推送 | 测试验证 |
| **release** | `v*` tag | `v1.2.3`, `latest` | 正式发布 |

不设 staging 环境 — 单容器项目在本地 `docker compose` 就能完整测试。

---

## 十、实施步骤

按照项目的 Phase 4 (打磨 + 迁移) 阶段实施:

### Step 1: 版本基础设施
- [ ] 创建 `internal/version/version.go` (版本变量)
- [ ] 修改 Dockerfile 接受 `VERSION` / `COMMIT` build arg
- [ ] 添加 `GET /api/version` 端点
- [ ] 添加 `--version` CLI flag
- [ ] 前端设置页显示版本信息

### Step 2: CI 流水线
- [ ] 创建 `.github/workflows/ci.yml`
- [ ] 配置 branch protection (main 分支需 CI 通过)
- [ ] 验证 Go test + 前端 test + Docker build 全部通过

### Step 3: Release 流水线
- [ ] 创建 `.github/workflows/release.yml`
- [ ] 配置 GHCR 推送
- [ ] 打首个 tag `v1.0.0`，验证完整流程
- [ ] (可选) 配置 Docker Hub 推送

### Step 4: 自我更新
- [ ] 实现 `GET /api/version/check` (查询 GitHub Releases)
- [ ] 实现更新执行逻辑 (Docker SDK pull + recreate)
- [ ] 实现回滚机制
- [ ] 前端更新 UI

---

## 十一、安全考量

| 风险 | 对策 |
|------|------|
| CI secrets 泄露 | 仅在 `release.yml` 中使用 secrets，PR 构建不推送 |
| 镜像供应链攻击 | 使用 pinned action versions (`@v4` 而非 `@main`) |
| 自我更新权限 | 更新操作需要已登录用户确认，不接受远程节点触发 |
| Docker socket 滥用 | 自我更新仅操作 passim 自身容器，白名单过滤 |
| 回滚失败 | 保留旧镜像 + 旧容器 rename 而非删除 |
