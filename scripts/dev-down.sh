#!/usr/bin/env bash
# Stop the local stack. Pass --volumes to also drop data volumes.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down "$@"
