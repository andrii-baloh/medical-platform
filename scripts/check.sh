#!/usr/bin/env bash
# Full local sanity check: typecheck, build, compose config validation.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[check] typecheck"
npm run typecheck

echo "[check] build"
npm run build

if command -v docker >/dev/null 2>&1; then
  echo "[check] docker compose config"
  docker compose config >/dev/null
else
  echo "[check] docker not found, skipping compose validation"
fi

echo "[check] done"
