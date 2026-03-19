# Stage 1: Frontend build (runs natively on build host — output is arch-independent)
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
RUN corepack enable
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# Stage 2: Go cross-compile (runs natively on build host via xx)
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend
ARG VERSION=dev
ARG COMMIT=unknown
ARG TARGETPLATFORM

# xx: Docker helper for cross-compilation
COPY --from=tonistiigi/xx / /
RUN apk add --no-cache clang lld
RUN xx-apk add --no-cache gcc musl-dev

WORKDIR /app
COPY passim/go.mod passim/go.sum ./passim/
RUN --mount=type=cache,target=/go/pkg/mod \
    cd passim && go mod download
COPY passim/ ./passim/
COPY --from=frontend /web/dist ./passim/cmd/passim/dist/
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    cd passim && \
    CGO_ENABLED=1 \
    CC="xx-clang" \
    xx-go build \
      -ldflags "-X github.com/passim/passim/internal/version.Version=${VERSION} \
                -X github.com/passim/passim/internal/version.Commit=${COMMIT} \
                -X github.com/passim/passim/internal/version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -o /passim ./cmd/passim/ && \
    xx-verify /passim

# Stage 3: Final image (target platform — only copies binaries, no compilation)
FROM alpine:3.21
RUN apk add --no-cache ca-certificates iperf3 su-exec
RUN addgroup -S passim && adduser -S passim -G passim

COPY --from=backend /passim /usr/local/bin/passim
COPY --from=backend /app/passim/templates/ /etc/passim/templates/
COPY passim/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data && chown passim:passim /data
VOLUME /data
EXPOSE 8443 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO /dev/null https://localhost:8443/api/status --no-check-certificate || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["passim"]
