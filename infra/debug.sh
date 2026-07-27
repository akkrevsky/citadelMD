#!/bin/bash
# Bring up the debug infra stack and optionally migrate/seed.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose --env-file .env_debug -f docker-compose.debug.yml"

# shellcheck disable=SC1091
source <(grep -E '^(GIT_REPO_HOST_PATH|GIT_REPO_PATH)=' .env_debug)

mkdir -p "${GIT_REPO_HOST_PATH:-/tmp/md-collab-docs-debug}"

case "${1:-up}" in
  up)
    echo "Starting debug infra (postgres :5433, redis :6380, minio :9002)..."
    $COMPOSE up -d
    echo ""
    echo "Debug infra is up. Next steps:"
    echo "  make -C infra debug-migrate   # first time only"
    echo "  make -C infra debug-seed      # first time only"
    echo "  pnpm dev:debug                # hot-reload apps"
    echo ""
    echo "Open http://localhost:5174"
    ;;
  down)
    $COMPOSE down
    ;;
  ps)
    $COMPOSE ps
    ;;
  logs)
    $COMPOSE logs -f --tail=100
    ;;
  setup)
    "$0" up
    echo "Waiting for postgres..."
    sleep 5
    make debug-migrate debug-seed
  ;;
  *)
    echo "Usage: $0 {up|down|ps|logs|setup}"
    exit 1
    ;;
esac
