# 07 — Roadmap для кодовых агентов

> v3 от 2026-07-19: web-only, commit/discard/restore в Phase 2, MCP server как отдельная фаза.
> Фазы для Codex / Claude Code / OpenCode. Каждая фаза = отдельный контекст агента.

---

## Принципы

1. **Одна фаза = один контекст агента.** Загружать только документы, перечисленные в фазе.
2. **TDD внутри фазы.** Каждая задача завершается тестом (Vitest/Supertest/Playwright).
3. **Commit после каждой задачи.** Conventional Commits, без Co-Authored-By.
4. **Двухуровневый review** между фазами (spec-compliance + quality) через `subagent-driven-development`.
5. **Каждая фаза заканчивается** working demo (что-то работает end-to-end).

---

## Phase 0 — Scaffolding & Infra

**Цель:** монорепо со всеми сервисами, `docker compose up` поднимает пустую систему.

**Загрузить контекст:**
- `01-requirements.md`
- `02-tech-stack-options.md`
- `06-infra-deploy.md`

### Задачи

1. Monorepo с pnpm workspaces: `apps/backend`, `apps/mcp-server`, `apps/yjs-server`, `apps/web`, `packages/shared`.
2. `tsconfig.base.json` (strict, ES2022, NodeNext), `eslint.config.js` (flat), `.prettierrc`, `.editorconfig`, `.gitignore`.
3. CI skeleton (`.github/workflows/ci.yml`): typecheck + lint + test.
4. `infra/docker-compose.yml` со всеми сервисами.
5. `infra/nginx/nginx.conf` (TLS, /api/, /socket, /mcp, /, rate-limit на /login).
6. Dockerfiles для backend, mcp-server, yjs-server, web.
7. `infra/minio/init.sh`.
8. Prisma schema (initial, пустая).
9. `packages/shared` с общими типами (Document, Folder, User) и GitService (обёртка над simple-git).
10. Backend `ensureGitRepo()` при старте (§5 из `06-infra-deploy.md`).
11. `infra/.env.example`, `infra/Makefile`.

**Критерии готовности:**
- [ ] `docker compose up -d` поднимает все сервисы, все healthchecks проходят.
- [ ] `curl https://localhost/api/health` возвращает `{status:"ok"}`.
- [ ] Git-репо существует на хосте после первого старта backend (auto-init).

---

## Phase 1 — Auth, Users, Roles, Folders, Tree

**Цель:** авторизованный доступ, управление пользователями, дерево папок.

**Загрузить контекст:**
- `01-requirements.md`
- `03-architecture.md` (§5, §8)
- `04-database-schema.md` (users, folders, folder_permissions)
- `05-api-contracts.md` (§2, §3, §4)

### Задачи

1. Prisma migration: `users`, `folders`, `folder_permissions`.
2. `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me/password`.
3. JWT в httpOnly cookie, middleware проверки ролей.
4. `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` (admin-only).
5. API key generation: `POST /api/users` и `PATCH { regenerateApiKey: true }` → `crypto.randomBytes(32).toString('hex')`.
6. `POST /api/folders`, `GET /api/tree`, `PATCH /api/folders/:id`, `DELETE /api/folders/:id`.
7. Git integration: создание/переименование/удаление папок = `mkdir`/`git mv`/`git rm` + commit (через shared GitService).
8. `GET/PUT /api/folders/:id/permissions` + effective-permission алгоритм (наследование).
9. Frontend: login screen, layout (sidebar tree + main area), admin users page, профиль с API key.
10. Seed: `admin` user (с apiKey) + корневая папка.

**Критерии готовности:**
- [ ] Логин под admin, создание/удаление пользователей через UI.
- [ ] Создание/удаление папок через UI = соответствующие git коммиты.
- [ ] Viewer видит только разрешённые папки в `/api/tree`.
- [ ] В профиле пользователя виден его API key.

---

## Phase 2 — Documents CRUD + Git storage + Versions

**Цель:** документы в Git, версионность, **ручной commit + discard + restore**.

**Загрузить контекст:**
- `03-architecture.md` (§2, §3, §4, §11)
- `04-database-schema.md` (documents)
- `05-api-contracts.md` (§5, §6, §11)

### Задачи

1. Prisma migration: таблица `documents`.
2. `POST /api/folders/:folderId/documents` (создание файла + первый commit).
3. `GET /api/documents/:id`, `GET /api/documents/:id/export` (из working tree).
4. `PATCH /api/documents/:id` (rename = `git mv`), `DELETE` (`git rm`).
5. GitService в shared: `commit`, `discard`, `restore`, `diffUncommitted`, `diff`, `log`, `show`.
6. Redis distributed lock `withFileLock(filePath, fn)` (§4.2 из `03-architecture.md`).
7. **`POST /api/documents/:id/commit`** — flush Yjs → git add → git commit.
8. **`POST /api/documents/:id/discard`** — `git checkout HEAD -- <file>` → reload Yjs.
9. `GET /api/documents/:id/diff` — незакоммиченные изменения.
10. `GET /api/documents/:id/revisions`, `GET /api/documents/:id/revisions/:sha`.
11. `GET /api/documents/:id/revisions/diff`, `POST /api/documents/:id/revisions/:sha/restore`.
12. Frontend: list of revisions, diff viewer (diff2html / react-diff-viewer), commit dialog, discard button, restore button.

**Критерии готовности:**
- [ ] Создание документа = коммит в Git.
- [ ] `POST /commit` создаёт новую версию (если есть изменения).
- [ ] `POST /discard` откатывает незакоммиченные правки к HEAD.
- [ ] Diff между двумя версиями отображается в UI.
- [ ] Restore откатывает к старой версии и создаёт новый коммит.
- [ ] Двое одновременно нажимают Commit → один 200, второй 409 Conflict.

---

## Phase 3 — Yjs real-time editing

**Цель:** real-time collaborative editing, auto-save в working tree.

**Загрузить контекст:**
- `03-architecture.md` (§3 — критический раздел)
- `05-api-contracts.md` (§9, §11)
- `references/realtime-md-stack.md` (из spec-authoring skill)

### Задачи

1. `apps/yjs-server` — y-redis инстанс, читает `GIT_REPO_PATH` при инициализации документа.
2. Handshake: парсинг `token`/`share` из query, валидация JWT/TTL.
3. Инициализация Y.Doc: `ydoc.getText('markdown') = <file content>`.
4. **Auto-save в working tree (5 сек)** — НЕ git commit, только запись в файл.
5. `POST /internal/flush?docid=...` — flush Yjs state в файл (для commit).
6. `POST /internal/reload?docid=...` — перечитать файл (для discard/restore), через `fast-diff` → Y.Text insert/delete.
7. `POST /internal/yjs-session-active?docid=...` — проверка, есть ли активная Yjs-сессия (для MCP conflict check).
8. Frontend: CodeMirror 6 с `y-codemirror.next`, awareness (курсоры других юзеров).
9. Frontend: markdown preview через `markdown-it` (debounce 300ms).
10. Frontend: индикатор незакоммиченных изменений (бейдж в header документа).
11. Periodic background commit (раз в час) для документов с активными Yjs-сессиями.

**Критерии готовности:**
- [x] Двое одновременно пишут в один документ — курсоры видны, мердж корректный.
- [x] Правки из web появляются в working tree через 5 сек (auto-save).
- [x] `POST /commit` создаёт новую версию, включая самые свежие правки (через flush).
- [x] `POST /discard` откатывает файл и все подключённые клиенты получают откат.
- [x] Закрытие документа (последний disconnect) = финальный flush в файл.

---

## Phase 4 — Markdown extensions, Uploads, Shares

**Цель:** все 8 расширений markdown, drag-n-drop attachments, публичные share-ссылки.

**Загрузить контекст:**
- `01-requirements.md` (раздел «Расширения Markdown»)
- `03-architecture.md` (§6, §7, §9)
- `04-database-schema.md` (uploads, shares, user_quotas)
- `05-api-contracts.md` (§7, §8)

### Задачи

1. Prisma migration: `uploads`, `shares`, `user_quotas`.
2. markdown-it setup с плагинами: prism, mermaid, katex, footnote, task-lists, container (callouts), GFM, embeds (custom).
3. DOMPurify на результате рендера.
4. `POST /api/uploads` (multipart), MIME check, size limit, quota check, MinIO PUT.
5. `GET /api/uploads/:id` (auth через JWT или share-token).
6. Drag-n-drop и paste-image в редакторе → upload → вставка `![](api/uploads/...)`.
7. `POST /api/documents/:id/shares` (генерация токена, TTL).
8. `GET /api/shares/:token/document` — публичный.
9. Гость в Yjs: read-only или write, в зависимости от `share.permission`.
10. Frontend: диалог создания share-ссылки, гостевой layout (без дерева).

**Критерии готовности:**
- [ ] Все 8 расширений markdown рендерятся корректно.
- [ ] Drag-n-drop картинки → загрузка → вставка → рендер.
- [ ] Создание share-ссылки с TTL, открытие в инкогнито работает.
- [ ] Read-only гость видит документ, но не может править.
- [ ] Write-гость может редактировать, но не может commit/discard/restore.

---

## Phase 5 — MCP Server

**Цель:** AI-агенты (Codex, Claude, др.) могут программно читать, искать, создавать и обновлять документы.

**Загрузить контекст:**
- `05-api-contracts.md` (§12 — MCP Server)
- `03-architecture.md` (§2, §3)
- `04-database-schema.md` (User.apiKey)

### Задачи

1. `apps/mcp-server` — отдельный сервис на порту 3100, HTTP+SSE transport.
2. Auth middleware: Bearer token (`User.apiKey`) → определение user + role.
3. Tools: `list_documents`, `get_document`, `search_documents` (через `git grep`).
4. Tools: `create_document`, `update_document` (перезапись working tree, conflict check с активной Yjs-сессией).
5. Tools: `commit_document`, `list_revisions`, `get_diff`, `restore_revision`.
6. Tools: `list_folders`.
7. Resources: `md-collab://documents/{id}`, `md-collab://documents/{id}/revisions`, `md-collab://folders/{id}/tree`.
8. `update_document` conflict handling: проверка через `POST /internal/yjs-session-active?docid=...` на yjs-server → 409 если активна.
9. Интеграционный тест: симуляция AI-агента (Codex-like) через MCP protocol.
10. Документация: README секция про MCP, пример настройки в Codex / Claude Code.
11. Nginx `/mcp` location уже настроен в Phase 0.

**Кriteri готовности:**
- [ ] AI-агент может подключиться к `/mcp` через Bearer API key.
- [ ] `list_documents` возвращает список документов с учётом прав.
- [ ] `get_document` возвращает содержимое.
- [ ] `search_documents` находит по `git grep`.
- [ ] `create_document` + `commit_document` создают новый документ с первой версией.
- [ ] `update_document` блокируется (409) при активной Yjs-сессии.

---

## Phase 6 — Hardening, Backup, Docs

**Цель:** продакшн-готовность, бэкапы, документация.

**Загрузить контекст:**
- `06-infra-deploy.md`
- `03-architecture.md` (§12, §13)

### Задачи

1. Integration tests (Playwright): login, create doc, edit simultaneously, share, commit/discard, restore.
2. Rate limit middleware (Fastify) на `/api/auth/login`.
3. Background job: чистка истёкших `shares` (каждую ночь).
4. Background job: `git gc` раз в неделю.
5. Background job: `git push mirror` каждые 6 часов.
6. Backup scripts: pg, minio, git-mirror — покрыть тестом.
7. README: установка, конфигурация, backup/restore, MCP setup.
8. Observability: `/api/health` углублённый (db, redis, minio, git, disk space).
9. UID matching между Docker и host (запуск под правильным UID).

**Критерии готовности:**
- [ ] Integration tests проходят в CI.
- [ ] Backup scripts отрабатывают по cron без ошибок.
- [ ] Документация позволяет новому админу развернуть систему за 1 час.
- [ ] MCP setup описан для Codex / Claude Code.

---

## Зависимости между фазами

```
Phase 0 (scaffolding)
   │
   ▼
Phase 1 (auth + folders)
   │
   ▼
Phase 2 (documents + Git + commit/discard/restore)
   │
   ├──► Phase 3 (Yjs real-time + auto-save)
   │       │
   │       └──► Phase 4 (markdown ext + uploads + shares)
   │                   │
   │                   └──► Phase 6 (hardening + backup + docs)
   │
   └──► Phase 5 (MCP server) — можно параллельно с Phase 3/4
```

**Оценка времени** (через `subagent-driven-development`):
- Phase 0: 1–2 часа
- Phase 1: 3–5 часов
- Phase 2: 4–6 часов (без Yjs, но с commit/discard/restore + diff viewer)
- Phase 3: 4–6 часов (упрощённая — нет reconciliation, только auto-save + reload)
- Phase 4: 4–6 часов
- Phase 5: 3–5 часов (MCP server)
- Phase 6: 2–3 часа

**Итого:** ~22–33 часов агент-времени.

---

## Как запускать фазы

### Вариант A: Напрямую через Codex CLI / Claude Code

Для каждой фазы — отдельный запуск с промптом. Контекст = только перечисленные документы ТЗ. Быстро, но без автопроверки.

### Вариант B: Через `subagent-driven-development` (рекомендуется)

1. Расширить каждую фазу в детальный bite-sized план через `writing-plans` (задачи по 2–5 минут, точные пути, TDD).
2. Исполнить план через `delegate_task` — по одной задаче, с двухуровневым review (spec + quality).
3. После каждой фазы — integration review + merge в main.

Вариант B в 1.5–2 раза дольше, но качество выше — особенно для Phase 3 (Yjs real-time).

---

## Рекомендуемая последовательность запуска

1. **Сначала — детальный `writing-plans` для Phase 0** (11 задач).
2. Исполнить Phase 0 через `subagent-driven-development`.
3. Зафиксировать результат, проверить `docker compose up`.
4. Переходить к Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6.
