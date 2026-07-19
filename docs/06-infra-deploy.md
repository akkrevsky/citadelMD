# 06 — Инфраструктура и деплой

> Docker Compose для разработки и прод-деплоя.
> v3 от 2026-07-19: web-only (без SSH/Obsidian), Git auto-init при старте backend, добавлен MCP server.

---

## 1. Структура проекта (monorepo)

```
md-collab/
├── apps/
│   ├── backend/              # Fastify API + git operations
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── mcp-server/           # Model Context Protocol server
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── yjs-server/           # y-redis gateway (ephemeral)
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                  # React SPA
│       ├── src/
│       ├── Dockerfile
│       └── package.json
├── packages/
│   └── shared/               # общие типы, JWT, git service
│       ├── src/
│       └── package.json
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   │   └── nginx.conf
│   ├── minio/
│   │   └── init.sh
│   ├── backup/
│   │   ├── pg-backup.sh
│   │   ├── git-mirror.sh
│   │   └── minio-backup.sh
│   ├── .env.example
│   └── Makefile
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

**Менеджер пакетов:** pnpm (workspace).

---

## 2. Docker Compose

```yaml
version: "3.9"

name: md-collab

networks:
  internal:

volumes:
  pg_data:
  minio_data:
  redis_data:

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-mdcollab}
      POSTGRES_USER: ${POSTGRES_USER:-mdcollab}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-mdcollab}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [internal]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks: [internal]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-mdcollab}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?required}
    volumes:
      - minio_data:/data
    ports:
      - "9001:9001"
    networks: [internal]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: /bin/sh
    command: [/init.sh]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-mdcollab}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_BUCKET: ${MINIO_BUCKET:-md-collab-uploads}
    volumes:
      - ./minio/init.sh:/init.sh:ro
    networks: [internal]
    restart: "no"

  backend:
    build:
      context: ../
      dockerfile: apps/backend/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-mdcollab}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-mdcollab}
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio
      MINIO_PORT: "9000"
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-mdcollab}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      MINIO_BUCKET: ${MINIO_BUCKET:-md-collab-uploads}
      JWT_SECRET: ${JWT_SECRET:?required}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?required}
      GIT_REPO_PATH: /data/docs
      YJS_SERVER_URL: http://yjs-server:1234
      MCP_SERVER_URL: http://mcp-server:3100
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-http://localhost}
    volumes:
      - ${GIT_REPO_HOST_PATH:-/var/lib/md-collab/docs}:/data/docs:rw
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks: [internal]

  yjs-server:
    build:
      context: ../
      dockerfile: apps/yjs-server/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:?required}
      GIT_REPO_PATH: /data/docs
      PORT: "1234"
    volumes:
      - ${GIT_REPO_HOST_PATH:-/var/lib/md-collab/docs}:/data/docs:rw
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:1234/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks: [internal]

  mcp-server:
    build:
      context: ../
      dockerfile: apps/mcp-server/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-mdcollab}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-mdcollab}
      REDIS_URL: redis://redis:6379
      GIT_REPO_PATH: /data/docs
      YJS_SERVER_URL: http://yjs-server:1234
      JWT_SECRET: ${JWT_SECRET:?required}
      PORT: "3100"
    volumes:
      - ${GIT_REPO_HOST_PATH:-/var/lib/md-collab/docs}:/data/docs:rw
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3100/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks: [internal]

  web:
    build:
      context: ../
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    networks: [internal]

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - backend
      - yjs-server
      - mcp-server
      - web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    networks: [internal]
```

**Всего 7 сервисов** в compose (postgres, redis, minio, minio-init, backend, yjs-server, mcp-server, web, nginx). minio-init — one-shot, можно не считать. Основных — 6 (в рамках 4–6 из требований).

---

## 3. `.env.example`

```env
# ===== Postgres =====
POSTGRES_DB=mdcollab
POSTGRES_USER=mdcollab
POSTGRES_PASSWORD=change_me_to_long_random_string

# ===== MinIO =====
MINIO_ROOT_USER=mdcollab
MINIO_ROOT_PASSWORD=change_me_to_long_random_string
MINIO_BUCKET=md-collab-uploads

# ===== JWT =====
JWT_SECRET=generate_with_openssl_rand_hex_32

# ===== Initial admin =====
ADMIN_PASSWORD=change_me_initial

# ===== Git repo (host path) =====
GIT_REPO_HOST_PATH=/var/lib/md-collab/docs

# ===== Public URL =====
PUBLIC_BASE_URL=https://md.example.com

# ===== Remote Git mirror (backup) =====
GIT_REMOTE_MIRROR_URL=git@github.com:yourorg/md-collab-mirror.git
```

---

## 4. Nginx config

```nginx
worker_processes auto;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;
  keepalive_timeout 65;
  client_max_body_size 30M;

  limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

  upstream backend { server backend:3000; }
  upstream yjs_server { server yjs-server:1234; }
  upstream mcp_server { server mcp-server:3100; }
  upstream web { server web:80; }

  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate-limited login
    location = /api/auth/login {
      limit_req zone=login burst=10 nodelay;
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # REST API
    location /api/ {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # MCP server (Model Context Protocol)
    location /mcp {
      proxy_pass http://mcp_server;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }

    # WebSocket (Yjs)
    location /socket {
      proxy_pass http://yjs_server;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }

    # SPA static
    location / {
      proxy_pass http://web;
      proxy_set_header Host $host;
    }
  }
}
```

---

## 5. Git auto-init при старте backend

Вместо ручного `setup.sh`, backend сам инициализирует репозиторий при первом запуске:

```typescript
// apps/backend/src/services/git-init.ts
import simpleGit from 'simple-git'
import fs from 'fs/promises'
import path from 'path'

export async function ensureGitRepo(repoPath: string) {
  const gitDir = path.join(repoPath, '.git')
  try {
    await fs.access(gitDir)
    console.log(`[git-init] Repo already exists at ${repoPath}`)
    return
  } catch {
    // .git не существует — инициализируем
  }

  console.log(`[git-init] Initializing git repo at ${repoPath}`)
  await fs.mkdir(repoPath, { recursive: true })

  const git = simpleGit(repoPath)
  await git.init()
  await git.addConfig('user.name', 'MD-Collab System')
  await git.addConfig('user.email', 'system@mdcollab.local')

  await fs.writeFile(path.join(repoPath, 'README.md'), '# MD-Collab Documents\n')
  await git.add('README.md')
  await git.commit('Initial commit')

  console.log('[git-init] Git repo initialized')
}
```

Вызывается в `apps/backend/src/index.ts` **до** запуска Fastify:

```typescript
import { ensureGitRepo } from './services/git-init'

async function main() {
  await ensureGitRepo(process.env.GIT_REPO_PATH!)
  // ...запуск Prisma, Fastify
}
main()
```

---

## 6. Dockerfiles

### 6.1. `apps/backend/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter backend build
RUN pnpm --filter backend --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
COPY apps/backend/prisma ./prisma
RUN npx prisma generate
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

### 6.2. `apps/mcp-server/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY apps/mcp-server ./apps/mcp-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mcp-server build
RUN pnpm --filter mcp-server --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3100
CMD ["node", "dist/index.js"]
```

### 6.3. `apps/yjs-server/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY apps/yjs-server ./apps/yjs-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter yjs-server build
RUN pnpm --filter yjs-server --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 1234
CMD ["node", "dist/index.js"]
```

### 6.4. `apps/web/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 7. MinIO init script

```bash
# infra/minio/init.sh
#!/bin/sh
set -e

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

BUCKET="${MINIO_BUCKET:-md-collab-uploads}"

if ! mc ls "local/$BUCKET" >/dev/null 2>&1; then
  mc mb "local/$BUCKET"
fi

mc anonymous set none "local/$BUCKET"

echo "MinIO bucket $BUCKET initialized."
```

---

## 8. Бэкапы

### 8.1. PG backup (метаданные)

```bash
# infra/backup/pg-backup.sh
#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/md-collab/pg}"
RETENTION_DAYS=7
TS=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${BACKUP_DIR}/mdcollab_${TS}.dump"

mkdir -p "$BACKUP_DIR"

docker compose -f /opt/md-collab/infra/docker-compose.yml \
  exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-mdcollab}" -d "${POSTGRES_DB:-mdcollab}" --format=custom \
  > "$DUMP_FILE"

gzip "$DUMP_FILE"
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup saved: ${DUMP_FILE}.gz"
```

Cron: ежедневно в 03:00.

### 8.2. Git mirror (backup контента)

```bash
# infra/backup/git-mirror.sh
#!/bin/bash
set -e

REPO_PATH="${GIT_REPO_HOST_PATH:-/var/lib/md-collab/docs}"
MIRROR_URL="${GIT_REMOTE_MIRROR_URL:?required}"

cd "$REPO_PATH"

if ! git remote get-url mirror >/dev/null 2>&1; then
  git remote add mirror "$MIRROR_URL"
fi

git push mirror --all
git push mirror --tags

echo "[$(date)] Git mirror push complete"
```

Cron: каждые 6 часов.

### 8.3. MinIO backup (опционально, раз в неделю)

```bash
# infra/backup/minio-backup.sh
#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/md-collab/minio}"
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v "$BACKUP_DIR":/backup \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  minio/mc:latest \
  sh -c "
    mc alias set src http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" || exit 1
    mc mirror --overwrite src/${MINIO_BUCKET:-md-collab-uploads} /backup/${TS}/
  "

find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +28 -exec rm -rf {} \;
```

---

## 9. Makefile

```makefile
# infra/Makefile
.PHONY: install dev build up down logs ps migrate seed backup

install:
	cd .. && pnpm install

dev up:
	docker compose -f docker-compose.yml up -d

build:
	docker compose -f docker-compose.yml build

down:
	docker compose -f docker-compose.yml down

logs:
	docker compose -f docker-compose.yml logs -f --tail=100

ps:
	docker compose -f docker-compose.yml ps

migrate:
	docker compose -f docker-compose.yml exec backend npx prisma migrate deploy

seed:
	docker compose -f docker-compose.yml exec backend node dist/prisma/seed.js

backup:
	./backup/pg-backup.sh
	./backup/git-mirror.sh
```

---

## 10. Полная процедура развёртывания

```bash
# 1. Создать каталог под Git-репозиторий
sudo mkdir -p /var/lib/md-collab/docs
# backend сам сделает git init при первом запуске — setup.sh НЕ нужен

# 2. Развертывание приложения
git clone <repo-url> /opt/md-collab
cd /opt/md-collab/infra
cp .env.example .env
# Отредактировать .env:
#   POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD,
#   MINIO_ROOT_PASSWORD, PUBLIC_BASE_URL, GIT_REMOTE_MIRROR_URL
docker compose up -d

# 3. Настройка TLS (Let's Encrypt)
sudo certbot certonly --standalone -d md.example.com
sudo cp /etc/letsencrypt/live/md.example.com/*.pem /opt/md-collab/infra/nginx/certs/
docker compose restart nginx

# 4. Добавить Git remote для mirror (после того, как backend создал репо)
cd /var/lib/md-collab/docs
sudo git remote add mirror git@github.com:yourorg/md-collab-mirror.git

# 5. Логин под admin (пароль = ADMIN_PASSWORD из .env)
# Создание пользователей через /api/users или UI
# Генерация API ключей для MCP — через UI профиля или PATCH /api/users/:id { regenerateApiKey: true }
```

---

## 11. Процедура обновления

```bash
cd /opt/md-collab
git pull
cd infra
docker compose build
docker compose up -d
# backend автоматически выполнит prisma migrate deploy + ensureGitRepo при старте
```

---

## 12. Разделение прав доступа к FS

| Пользователь / сервис | Доступ к `/var/lib/md-collab/docs/` | Зачем |
|---|---|---|
| **Docker backend container** | rw | Все git ops (commit/discard/restore/diff/log), auto-init, periodic background commit |
| **Docker yjs-server container** | rw | Auto-save в working tree (5s), init Y.Doc из файла |
| **Docker mcp-server container** | rw | `get_document`, `update_document`, `search_documents` (git grep), `commit_document` |

Все операции с Git выполняются внутри Docker-контейнеров. **Прямого доступа снаружи нет** (без SSH, без file watcher, без Obsidian).

---

## 13. Мониторинг

- Логи контейнеров: `docker compose logs -f`
- Health checks: `GET /api/health` (backend), `GET /health` (yjs-server, mcp-server)
- Опционально: `uptime-kuma` (ping `/api/health`)

---

## 14. Открытые вопросы

- **UID matching** — Docker-контейнеры по умолчанию запускаются от root. Для прода: запуск от непривилегированного пользователя внутри контейнера.
- **git gc** — встроенный `git gc --auto`, опционально cron раз в неделю.
- **MCP transport** — HTTP+SSE для прод-деплоя, stdio для локального использования.
- **Periodic background commit** — backend раз в час для документов с активными Yjs-сессиями и изменениями.
