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
FROM alpine:3.20
RUN apk add --no-cache ca-certificates iperf3
COPY --from=backend /passim /usr/local/bin/passim
COPY passim/templates/ /etc/passim/templates/

VOLUME /data
EXPOSE 8443 80

ENTRYPOINT ["passim"]
