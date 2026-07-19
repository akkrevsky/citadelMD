# Промпт: Фаза 0 — Scaffolding

> Готовый промпт для Codex / Claude Code. Самодостаточный — агент не знает контекста проекта.

---

## Команда запуска (Codex CLI)

```bash
cd /home/sp/workspace
PATH+HTTP_PROXY=http://127.0.0.1:18080 codex -p openrouter exec --sandbox danger-full-access \
  "$(cat /home/sp/workspace/md-collab/prompts/phase-0-scaffolding.md)"
```

## Альтернатива (Claude Code)

```bash
cd /home/sp/workspace
claude "$(cat /home/sp/workspace/md-collab/prompts/phase-0-scaffolding.md)"
```

---

## Промпт (копировать целиком)

````
Ты — senior Node.js/TypeScript разработчик. Создаёшь монорепо для нового проекта "md-collab" — системы совместного редактирования Markdown-документов с real-time коллаборацией через Yjs.

ПОЛНОЕ ТЗ лежит в /home/sp/workspace/md-collab/ — обязательно прочитай перед стартом:
- 03-architecture.md — компонентная архитектура
- 04-database-schema.md — Prisma schema
- 05-api-contracts.md — REST + WS API
- 06-infra-deploy.md — Docker Compose, Nginx, Dockerfiles
- 07-agent-roadmap.md — план разработки по фазам

ЗАДАЧА: реализуй ТОЛЬКО ФАЗУ 0 (Scaffolding). Не лезь дальше.

Конкретно — три подзадачи:

### 0.1. Создать структуру монорепо в /home/sp/workspace/md-collab/repo/

Структура:
```
repo/
├── apps/
│   ├── backend/              # Fastify API (пока пустой, только package.json)
│   ├── yjs-server/           # y-redis gateway (пока пустой)
│   └── web/                  # React SPA (пока пустой)
├── packages/
│   └── shared/               # общие типы, JWT-утилиты (пока пустой)
├── infra/
│   ├── docker-compose.yml    # ФАЗА 0.2
│   ├── nginx/
│   ├── minio/
│   └── .env.example
├── .gitignore
├── .editorconfig
├── .prettierrc
├── eslint.config.js
├── tsconfig.base.json
├── package.json              # root, private, workspaces
└── pnpm-workspace.yaml
```

Требования:
- pnpm workspace (версия pnpm 9.x). В root package.json укажи workspaces через pnpm-workspace.yaml.
- Node 20 LTS (укажи в package.json "engines").
- TypeScript 5.x.
- Общий tsconfig.base.json с strict mode, target ES2022, module NodeNext.
- ESLint flat config (eslint.config.js) с @typescript-eslint.
- Prettier с defaults.
- .editorconfig: utf-8, 2 пробела, lf, final newline.
- .gitignore: node_modules, dist, .env, .env.local, coverage, *.log, .DS_Store, .turbo, .vite.

Для каждого подпакета (apps/backend, apps/yjs-server, apps/web, packages/shared) создай минимальный package.json с правильным именем в формате "@md-collab/<name>" и пустым index.ts/tsconfig.json, чтобы `pnpm install` проходил без ошибок.

### 0.2. Docker Compose skeleton

Создай infra/docker-compose.yml, который поднимает ТОЛЬКО инфра-сервисы (без app-контейнеров — они появятся в Фазе 1):
- postgres:16-alpine (база mdcollab, user mdcollab, пароль из env)
- redis:7-alpine
- minio/minio (с console на :9001 для dev)
- minio-init (minio/mc, создаёт bucket md-collab-uploads)

Все сервисы:
- в общей сети `internal`
- с healthchecks
- с volume для persistent data
- restart: unless-stopped

Порты торчат наружу ТОЛЬКО для dev (postgres 5432, redis 6379, minio 9000+9001). В prod-override это будет убрано.

infra/.env.example — все переменные с плейсхолдерами и комментариями.

infra/minio/init.sh — скрипт инициализации bucket (mc alias set + mc mb + mc anonymous set none).

### 0.3. README.md в корне repo/

Краткий README с разделами: что это, стек, как запустить dev-инфру (docker compose up), команда pnpm install, структура монорепо.

---

ACCEPTANCE CRITERIA (проверь сам перед сдачей):

1. `cd /home/sp/workspace/md-collab/repo && pnpm install` — завершается без ошибок.
2. `cd /home/sp/workspace/md-collab/repo && pnpm -r build` — если есть хоть один tsc-таргет, сборка проходит. Если билд-скриптов пока нет — ок.
3. `cd /home/sp/workspace/md-collab/repo/infra && docker compose up -d` — поднимает 4 сервиса (postgres, redis, minio, minio-init), все становятся healthy в течение 30 секунд.
4. После поднятия:
   - `docker compose exec postgres pg_isready -U mdcollab` → success
   - `docker compose exec redis redis-cli ping` → PONG
   - Bucket `md-collab-uploads` существует (проверка через mc).
5. `cd /home/sp/workspace/md-collab/repo && git init && git add -A && git commit -m "feat: phase 0 scaffolding"` проходит (ничего не падает).
6. Все package.json имеют согласованные имена (@md-collab/*), версии 0.0.0, private: true для root.

ОГРАНИЧЕНИЯ:
- Не создавай код для backend/yjs-server/web — только пустые пакеты с package.json.
- Не добавляй фичи вне acceptance criteria.
- Не меняй файлы ТЗ в /home/sp/workspace/md-collab/*.md.
- Коммиты — Conventional Commits. Без Co-Authored-By.
- Финальный отчёт: список созданных файлов + вывод acceptance checks.

Приступай.
````
