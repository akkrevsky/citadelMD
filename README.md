# MD-Collab — Self-hosted collaborative Markdown editor

> Статус: **ТЗ готово (v3 — web-only + commit/discard/restore + MCP)** · 2026-07-19

## Что это

Самописная веб-система для совместного редактирования Markdown-документов с real-time CRDT-коллаборацией, **версионностью через Git** (diff'ы, восстановление, **ручной commit**) и **MCP-сервером для AI-агентов**. Разворачивается на собственном VPS командой из ~10 человек. Реализуется кодовыми агентами (Codex/Claude Code) по этому ТЗ.

## Ключевые характеристики

- 📝 **Pure Markdown** — файлы валидны как `.md`, портируемы
- 🌳 **Git как движок хранения** — каждый `.md` файл в Git-репозитории
- 🔄 **Real-time co-editing** через Yjs CRDT (cursor-level, посимвольный мердж)
- 💾 **Auto-save** — правки пишутся в файл каждые 5 сек (не теряются при сбое)
- 📜 **Ручной commit** — пользователь сам решает, когда создать версию (не каждый чих)
- ↩️ **Discard** — откат незакоммиченных правок к последнему коммиту
- 🔄 **Restore** — восстановление любой старой версии
- 🔍 **Diff как в git** — добавлено/удалено, между любыми версиями
- 🤖 **MCP-сервер** — AI-агенты (Codex/Claude) могут читать, искать, создавать и обновлять документы
- 🔐 **Роли:** ADMIN / EDITOR / VIEWER
- 🔗 **Публичные share-ссылки** с TTL и правами read/write
- 🧩 **8 расширений markdown:** Mermaid, KaTeX, code highlight, embeds, tables, callouts, task-lists, footnotes
- 📎 **Attachments:** drag-n-drop, paste-image, MinIO/S3 (200 ГБ)
- 🐳 **Docker Compose** — 6 сервисов, разворачивается одной командой

## Зафиксированный стек

| Компонент | Решение |
|---|---|
| Frontend | React + Vite + CodeMirror 6 + y-codemirror.next + markdown-it |
| Backend | Node.js 20 + TypeScript + Fastify + Prisma |
| Real-time | Yjs + y-redis (WebSocket gateway, ephemeral) |
| MCP Server | Node.js + TypeScript + HTTP+SSE transport |
| Storage (контент) | **Git working repo на FS** (`/var/lib/md-collab/docs/`) |
| Storage (метаданные) | PostgreSQL 16 |
| Storage (attachments) | MinIO (S3) |
| Cache / locks / pub-sub | Redis 7 |
| Reverse proxy | Nginx (TLS, WebSocket) |
| Auth | JWT в httpOnly cookie + API key для MCP |
| Пакетный менеджер | pnpm (workspace monorepo) |

## Документы

| Файл | Содержание |
|---|---|
| [`01-requirements.md`](./01-requirements.md) | ✅ Требования (функциональные + нефункциональные) |
| [`02-tech-stack-options.md`](./02-tech-stack-options.md) | ✅ Сравнение стека + зафиксированные решения |
| [`03-architecture.md`](./03-architecture.md) | ✅ Компоненты, потоки данных, модель сохранения (auto-save + ручной commit) |
| [`04-database-schema.md`](./04-database-schema.md) | ✅ Postgres/Prisma (метаданные только, без content_md) |
| [`05-api-contracts.md`](./05-api-contracts.md) | ✅ REST + WS протокол + commit/discard/restore + **MCP tools** |
| [`06-infra-deploy.md`](./06-infra-deploy.md) | ✅ Docker Compose, Nginx, Git auto-init, backup scripts |
| [`07-agent-roadmap.md`](./07-agent-roadmap.md) | ✅ 7 фаз для кодовых агентов (Phase 0–6) |

## Архитектурные решения (v3 от 2026-07-19)

1. **Source of truth = Git HEAD.** Working tree = «черновик» с незакоммиченными правками.
2. **Yjs ephemeral** — инициализируется из working tree при открытии, debounced auto-save каждые 5 сек.
3. **Ручной commit** — кнопка «Сохранить версию», git commit с GIT_AUTHOR_* от пользователя.
4. **Discard** — `git checkout HEAD -- <file>`, откат незакоммиченных правок.
5. **Restore** — `git checkout <sha> -- <file>` + новый commit, восстановление старой версии.
6. **MCP server** — отдельный сервис (порт 3100), Bearer API key auth, tools для AI-агентов.
7. **Web-only** — без Obsidian, SSH, локальных файлов, file watcher, reconciliation. Только редактирование в браузере.

## Следующий шаг

Roadmap (`07-agent-roadmap.md`) предлагает два варианта запуска разработки:

1. **Напрямую через Codex/Claude Code** — по фазам. Быстрее.
2. **Через `subagent-driven-development`** — с детальными планами (`writing-plans`) и двухуровневым review. Качественнее.

Рекомендация: начать с детального плана для **Phase 0** (scaffolding) и исполнить через `subagent-driven-development`. См. `07-agent-roadmap.md` → раздел «Как запускать фазы».
