.PHONY: install dev up build rebuild redeploy down logs ps migrate seed backup \
	debug-up debug-down debug-stop debug-ps debug-logs debug-migrate debug-seed debug-setup \
	debug-dev debug

DEBUG_COMPOSE = docker compose --env-file .env_debug -f docker-compose.debug.yml
DEBUG_PORTS = 5174 3001 1236 1237 3101

install:
	cd .. && pnpm install && pnpm -r build

dev up:
	docker compose -f docker-compose.yml up -d

build:
	docker compose -f docker-compose.yml build

rebuild:
	docker compose -f docker-compose.yml down
	cd .. && pnpm install && pnpm -r build
	docker compose -f docker-compose.yml build --no-cache
	docker compose -f docker-compose.yml up -d
	docker compose -f docker-compose.yml exec backend npx prisma migrate deploy
	docker compose -f docker-compose.yml exec backend npx prisma db seed

# Rebuild images from current source and recreate containers in place
# (no down, no DB migration — untouched services keep running). --force-recreate
# is required: `up -d` alone does NOT swap containers to the new image.
# Services are recreated sequentially, so the availability gap is seconds.
redeploy:
	docker compose -f docker-compose.yml build
	docker compose -f docker-compose.yml up -d --force-recreate --no-deps --remove-orphans \
		backend web yjs-server mcp-server
	@echo "Waiting for services to become healthy..."
	@for i in $$(seq 1 60); do \
	  bad=$$(docker compose -f docker-compose.yml ps --format '{{.Health}}' | grep -E 'unhealthy|starting' || true); \
	  [ -z "$$bad" ] && break; \
	  sleep 2; \
	done
	docker compose -f docker-compose.yml ps
	@echo "Smoke checks:"
	@curl -sf http://localhost:8081/api/health > /dev/null && echo "  api via web (8081): ok" || echo "  api via web (8081): FAILED"
	@code=$$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' -d '{}'); \
	echo "  auth route responds with $$code"

down:
	docker compose -f docker-compose.yml down

logs:
	docker compose -f docker-compose.yml logs -f --tail=100

ps:
	docker compose -f docker-compose.yml ps

migrate:
	docker compose -f docker-compose.yml exec backend npx prisma migrate deploy

seed:
	docker compose -f docker-compose.yml exec backend npx prisma db seed

backup:
	./backup/pg-backup.sh
	./backup/git-mirror.sh

debug-up:
	@mkdir -p "$$(grep '^GIT_REPO_HOST_PATH=' .env_debug | cut -d= -f2-)"
	$(DEBUG_COMPOSE) up -d
	@echo ""
	@echo "Debug infra ready (postgres :5433, redis :6380, minio :9002)."
	@echo "Run: make debug-dev  ->  http://localhost:5174"

# Stop local debug app processes (keeps Docker infra running).
debug-stop:
	@echo "Stopping debug app processes on ports $(DEBUG_PORTS)..."
	@for port in $(DEBUG_PORTS); do \
	  if command -v fuser >/dev/null 2>&1; then \
	    fuser -k $$port/tcp >/dev/null 2>&1 || true; \
	  else \
	    pid=$$(lsof -ti tcp:$$port 2>/dev/null || true); \
	    if [ -n "$$pid" ]; then kill $$pid 2>/dev/null || true; fi; \
	  fi; \
	done
	@sleep 1
	@busy=$$(ss -tln 2>/dev/null | grep -E ':5174|:3001|:1236|:1237|:3101' || true); \
	if [ -n "$$busy" ]; then \
	  echo "Warning: some debug ports are still in use:"; \
	  echo "$$busy"; \
	  exit 1; \
	fi
	@echo "Debug app ports are free."

# Infra (if needed) + hot-reload apps on debug ports (foreground).
debug-dev: debug-stop debug-up
	@echo "Starting apps (web :5174, backend :3001, yjs :1236/:1237, mcp :3101)..."
	cd .. && pnpm dev:debug

# Alias for debug-dev
debug: debug-dev

debug-down:
	$(DEBUG_COMPOSE) down

debug-ps:
	$(DEBUG_COMPOSE) ps

debug-logs:
	$(DEBUG_COMPOSE) logs -f --tail=100

debug-migrate:
	set -a; . ./.env_debug; set +a; cd ../apps/backend && npx prisma migrate deploy

debug-seed:
	set -a; . ./.env_debug; set +a; cd ../apps/backend && npx tsx prisma/seed.ts

debug-setup: debug-up
	@echo "Waiting for postgres..."
	@sleep 5
	$(MAKE) debug-migrate debug-seed
	@echo ""
	@echo "Setup done. Run: make debug-dev"
