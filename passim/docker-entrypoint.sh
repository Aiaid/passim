#!/bin/sh
set -e

# If Docker socket is mounted, ensure the passim user can access it.
SOCK=/var/run/docker.sock
if [ -S "$SOCK" ]; then
  SOCK_GID=$(stat -c '%g' "$SOCK" 2>/dev/null || stat -f '%g' "$SOCK")
  # If the socket GID is 0 (root), add passim to root group.
  # Otherwise create/find the group and add passim to it.
  if [ "$SOCK_GID" -eq 0 ]; then
    addgroup passim root 2>/dev/null || true
  else
    # Find or create a group with the socket's GID
    SOCK_GROUP=$(getent group "$SOCK_GID" | cut -d: -f1 || true)
    if [ -z "$SOCK_GROUP" ]; then
      SOCK_GROUP=docker
      addgroup -g "$SOCK_GID" -S "$SOCK_GROUP" 2>/dev/null || true
    fi
    addgroup passim "$SOCK_GROUP" 2>/dev/null || true
  fi
fi

exec su-exec passim "$@"
