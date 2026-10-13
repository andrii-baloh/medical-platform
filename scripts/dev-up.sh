#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo 'BLOCKED: Docker CLI is unavailable.' >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo 'BLOCKED: Docker engine is unavailable.' >&2
  exit 2
fi

[ -f .env ] || cp .env.example .env
node scripts/check-infra.cjs
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build

echo 'MediCare local stack start requested. Check docker compose ps for health.'
