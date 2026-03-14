# Stage 1: Frontend build
FROM node:22-alpine AS frontend
RUN corepack enable
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# Stage 2: Go build
FROM golang:1.25-alpine AS backend
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY passim/go.mod passim/go.sum ./passim/
RUN cd passim && go mod download
COPY passim/ ./passim/
# Copy frontend build output into Go embed directory
COPY --from=frontend /web/dist ./passim/cmd/passim/dist/
RUN cd passim && CGO_ENABLED=1 go build -o /passim ./cmd/passim/

# Stage 3: Final image
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
