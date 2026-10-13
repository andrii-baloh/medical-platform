#!/usr/bin/env bash
set -euo pipefail
exec 3<>/dev/tcp/127.0.0.1/9000
printf 'GET /health/ready HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
status="$(head -n 1 <&3 || true)"
case "$status" in
  "HTTP/1.0 200"*|"HTTP/1.1 200"*) exit 0 ;;
  *) echo "Keycloak not ready: $status" >&2; exit 1 ;;
esac
