#!/usr/bin/env bash
# Start the full local stack (infra + api + web) in the background.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "[dev-up] .env not found, copying from .env.example"
  cp .env.example .env
  echo "[dev-up] Edit .env and replace all 'replace-with-...' values before production use."
fi

docker compose up -d --build
docker compose ps
