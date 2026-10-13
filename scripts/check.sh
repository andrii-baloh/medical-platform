#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."

node scripts/check-infra.cjs
node --check infra/web/next.config.mjs
node --check scripts/check-infra.cjs
npm run typecheck
npm run build

if ! command -v docker >/dev/null 2>&1; then
  echo 'BLOCKED: Docker CLI is unavailable. Runtime/E2E not executed.' >&2
  exit 2
fi

env_file=.env.example
[ -f .env ] && env_file=.env
docker compose --env-file "$env_file" config --quiet

if ! docker info >/dev/null 2>&1; then
  echo 'BLOCKED: Docker engine is unavailable. Runtime/E2E not executed.' >&2
  exit 2
fi

echo 'Static checks passed; Docker engine is available.'
