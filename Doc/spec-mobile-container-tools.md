# Mobile Container Logs & Terminal

## Overview

Add container log viewing and interactive terminal access to the Expo mobile app, matching the web UI's container detail panel capabilities.

## Screens

### Container Logs (`/containers/[id]/logs`)

- Full-screen log viewer accessible from app detail and container cards
- Fetches logs via `GET /api/containers/:id/logs` using the shared API client
- Features: auto-scroll toggle, pull-to-refresh, line numbers
- Terminal-style dark UI matching the web's log viewer aesthetic

### Container Terminal (`/containers/[id]/terminal`)

- WebSocket-based interactive shell via `GET /api/containers/:id/terminal`
- Text-based terminal (TextInput + ScrollView approach since xterm.js is not available on RN)
- Quick action bar: Tab, Ctrl+C, Ctrl+D, arrow keys
- Connection status indicator (connecting/connected/disconnected)
- Reconnect capability when disconnected

## Navigation

- App detail screen (`/apps/[id]`) gains "Logs" and "Terminal" buttons in a new "Container" section
- Container cards on the node detail screen gain "Logs" and "Terminal" action buttons

## API

Uses existing endpoints, no backend changes required:
- `GET /api/containers/:id/logs` - fetch container logs
- `WS /api/containers/:id/terminal?token=...` - interactive terminal

## i18n Keys Added

| Key | en-US | zh-CN |
|-----|-------|-------|
| `container.auto_scroll` | Auto-scroll | 自动滚动 |
| `container.no_logs` | No logs available | 暂无日志 |
| `container.view_logs` | Logs | 日志 |
| `container.view_terminal` | Terminal | 终端 |
| `container.terminal_placeholder` | Type a command... | 输入命令... |
| `container.terminal_reconnect` | Reconnect | 重新连接 |
| `container.terminal_session_ended` | -- session ended -- | -- 会话已结束 -- |
