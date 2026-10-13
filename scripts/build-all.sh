#!/usr/bin/env bash
# Build all workspaces (api, web) with typecheck first.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-all] typecheck"
npm run typecheck

echo "[build-all] build"
npm run build

echo "[build-all] done"
