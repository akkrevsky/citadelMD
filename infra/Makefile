.PHONY: install dev up build rebuild down logs ps migrate seed backup \
	debug-up debug-down debug-ps debug-logs debug-migrate debug-seed debug-setup

DEBUG_COMPOSE = docker compose --env-file .env_debug -f docker-compose.debug.yml

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
	@echo "Run: pnpm dev:debug  ->  http://localhost:5174"

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
