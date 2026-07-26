.PHONY: install dev up build rebuild down logs ps migrate seed backup

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
