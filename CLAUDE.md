# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

citadelMD is a self-hosted collaborative Markdown editor with real-time CRDT editing, Git-based versioning, manual commit/discard/restore, and an MCP server for AI agents. The full specification lives under `docs/` — read the relevant files before starting any task.

## Critical architectural rules (DO NOT violate)

1. **Source of truth = Git HEAD.** The Markdown file content lives ONLY in the Git working repo at `$GIT_REPO_PATH` (default `/var/lib/md-collab/docs/`). Never store document content in Postgres.
2. **Postgres stores metadata only.** Tables: users, folders, documents (with `file_path` pointer, NO content column), folder_permissions, shares, uploads, user_quotas.
3. **Yjs is ephemeral.** The y-redis container initializes Y.Doc from the file on open, auto-saves to the working tree every 5 seconds (NO git commit), and is destroyed on last disconnect. Yjs state is never persisted to the database.
4. **Only y-redis writes to the working tree directly** (via auto-save). The backend reaches the file through git operations (commit/discard/restore) and asks y-redis to flush/reload via internal HTTP endpoints. Both paths serialize through a Redis distributed lock on the file path.
5. **Manual commit only.** Never auto-commit on every edit. The user presses a button. Backend flow: acquire lock -> POST yjs-server `/internal/flush` -> `git add` -> `git commit` -> release lock.
6. **No SSH, no Obsidian, no file watcher, no external reconciliation.** All editing happens in the browser. There is no external source of file changes.
7. **Git author = system user.** Every commit sets GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL / GIT_COMMITTER_* from the user record (gitName/gitEmail, fallback to login + `<login>@mdcollab.local`).

## Tech stack

- Monorepo: pnpm workspaces — `apps/backend`, `apps/yjs-server`, `apps/mcp-server`, `apps/web`, `packages/shared`
- pnpm workspace config ([pnpm-workspace.yaml](pnpm-workspace.yaml)) includes `allowBuilds` for native packages: `@prisma/client`, `@prisma/engines`, `esbuild`, `prisma`
- Backend: Node.js 20 + TypeScript + Fastify + Prisma
- Frontend: React + Vite + CodeMirror 6 + y-codemirror.next + markdown-it
- Real-time: Yjs + y-redis
- Storage: Git working repo (content), Postgres 16 (metadata), MinIO (attachments), Redis 7 (cache/locks/pub-sub)
- Tests: Vitest (unit/integration), Supertest (API), Playwright (e2e)
- Linting: ESLint flat config + Prettier

## Port map

| Port | Service | Notes |
|---|---|---|
| 80/443 | nginx | Reverse proxy, terminates TLS, routes by path |
| 3000 | backend | Fastify REST API |
| 1234 | yjs-server (HTTP) | Health check + `/internal/flush`, `/internal/reload`, `/internal/yjs-session-active` |
| 1235 | yjs-server (WS) | Raw WebSocket for Yjs sync (`ws://host:1235?docid=...`). Nginx proxies `/socket` to this port |
| 3100 | mcp-server | MCP tools for AI agents (Phase 5), HTTP+SSE transport via `/mcp` |
| 5173 | web (dev) | Vite dev server with hot reload |
| 8081 | web (Docker) | Production build served via nginx proxy to port 80 |
| 9001 | MinIO console | MinIO web UI (exposed for debugging) |

## Key commands

### Development
- `pnpm install` — install all dependencies
- `pnpm --filter backend dev` — backend in dev mode (tsx watch, port 3000)
- `pnpm --filter web dev` — frontend Vite dev server (port 5173, proxies `/api`→3000, `/socket`→1234)
- `pnpm --filter yjs-server dev` — yjs-server in dev mode (HTTP 1234 + WS 1235)
- `pnpm --filter mcp-server dev` — mcp-server in dev mode (port 3100)
- `pnpm dev` — run ALL packages in dev mode in parallel

### Build
- `pnpm build` — build all packages (requires `tsc` in each)
- `pnpm --filter <name> build` — build a single package
- `pnpm typecheck` — type-check all packages without emitting

### Testing
- `pnpm test` — run all tests across all packages
- `pnpm --filter backend test` — backend tests only (Vitest)
- `pnpm --filter shared test` — shared package tests
- `pnpm --filter web exec vitest run` — web tests (Vitest)
- `pnpm --filter backend exec vitest run path/to/test.test.ts` — run a single test file
- `pnpm --filter backend exec vitest` — backend tests in watch mode

### Linting
- `pnpm lint` — ESLint across all packages (flat config)

### Docker (full stack)
- `docker compose -f infra/docker-compose.yml up -d` — bring up all services (postgres, redis, minio, minio-init, backend, yjs-server, mcp-server, web, nginx)
- `docker compose -f infra/docker-compose.yml exec backend npx prisma migrate deploy` — apply DB migrations
- `docker compose -f infra/docker-compose.yml exec backend npx prisma db seed` — seed the database (creates default admin user)
- `make` (from repo root) — see [infra/Makefile](infra/Makefile) for targets: `make install`, `make up`, `make build`, `make down`, `make logs`, `make migrate`, `make seed`, `make backup`
- [infra/start.sh](infra/start.sh) — quick-start script: copies `.env` if missing, brings up Docker, waits for health, tests API
- [infra/docker-compose.override.yml](infra/docker-compose.override.yml) — exposes dev ports (backend:3000, web:8081, yjs-server:1234+1235) for local development without nginx

### Environment variables

Required env vars for local development (see [infra/.env.example](infra/.env.example) and annotated [infra/.env.complete](infra/.env.complete)):

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | backend, mcp-server | Postgres connection string |
| `JWT_SECRET` | backend, yjs-server, mcp-server | JWT signing secret (≥256 bits) |
| `GIT_REPO_PATH` | backend, yjs-server, mcp-server | Path to Git working repo (default `/var/lib/md-collab/docs/`) |
| `REDIS_URL` | backend, yjs-server | Redis connection for locks/cache |
| `YJS_SERVER_URL` | backend | URL for yjs-server internal HTTP calls |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` | backend | S3-compatible storage for uploads |
| `ADMIN_PASSWORD` | backend | Default admin user password (used at first startup) |

For the full Docker stack, also set `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, and `GIT_REPO_HOST_PATH`.

### Prisma (local dev)
- `pnpm --filter backend exec npx prisma migrate dev` — create and apply a new migration
- `pnpm --filter backend exec npx prisma generate` — regenerate Prisma client after schema changes
- `pnpm --filter backend exec npx prisma db push` — push schema directly without migrations (prototyping only)

## Service architecture

### nginx routing (the service topology)
nginx is the single entry point. Path-based routing reveals how services relate:
- `/api/auth/login` — public, proxied to backend:3000
- `/api/*` — proxied to backend:3000 (JWT in httpOnly cookie)
- `/socket` — WebSocket upgrade to yjs-server:1235 (Yjs sync)
- `/mcp` — SSE/streaming to mcp-server:3100 (MCP tools)
- `/` — static files from web:80 (production SPA)

### Auth architecture

Three authentication methods, all handled in [apps/backend/src/middleware/auth.ts](apps/backend/src/middleware/auth.ts):

1. **Cookie (JWT in httpOnly cookie)** — primary method for the web frontend. Token set by `POST /api/auth/login`, auto-sent via `credentials: 'same-origin'` on all fetch calls.
2. **Bearer token (Authorization header)** — for API clients. Same JWT, different transport. Middleware checks `Authorization: Bearer <token>` as fallback when no cookie is present.
3. **ApiKey (Authorization header)** — for MCP server and external automation. Middleware checks `Authorization: ApiKey <key>`, looks up the `apiKey` column in the users table. Used by the MCP server to authenticate agent requests.

The `authMiddleware` (aliased as `verifyAuth`) runs first, trying cookie → Bearer → ApiKey. The `requireRole(...roles)` middleware runs after auth to enforce role-based access (ADMIN, EDITOR, VIEWER). The `apiKeyMiddleware` handles the ApiKey path specifically and attaches the user to the request.

### Frontend architecture

React SPA with React Router, plain CSS (CSS custom properties for theming), no CSS framework.

**Routing** ([apps/web/src/App.tsx](apps/web/src/App.tsx)):
- `/login` — public login page
- `/share/:token` — public share link (guest access, no auth required)
- `/` — authenticated dashboard (layout wrapper with sidebar)
  - `/` (index) — home/documents list
  - `/admin/users` — user management (ADMIN only)
  - `/profile` — user profile / change password
  - `/documents/:id/edit` — full-page document editor (split-view: editor + preview)

**Component tree for document editing** ([apps/web/src/pages/DocumentEditPage.tsx](apps/web/src/pages/DocumentEditPage.tsx)):
- `DocumentEditPage` — orchestrates the editor; manages commit/discard state, view mode, connection status
  - `TabBar` — open document tabs
  - `EditorToolbar` — view mode toggle (edit/split/preview), commit/discard buttons, theme toggle, Excalidraw toggle
  - `CollaborativeEditor` — CodeMirror 6 + Yjs binding (y-codemirror.next), real-time cursor sync
  - `MarkdownPreview` — rendered markdown via markdown-it + DOMPurify
  - `ExcalidrawEditor` — lazy-loaded (`React.lazy`), Excalidraw whiteboard embedded in markdown
  - `StatusBar` — connection status, word/char/line count, cursor position
  - `UploadIndicator` — file upload progress (drag-n-drop + paste-image → MinIO)

**Styling**: Plain CSS files in [apps/web/src/styles/](apps/web/src/styles/). Theme switching via `data-theme` attribute on `<html>` (values: `dark` | `light`), persisted in localStorage. Theme context from [apps/web/src/hooks/useTheme.tsx](apps/web/src/hooks/useTheme.tsx). Separate CSS files per concern: `styles.css` (base), `editor.css`, `preview.css`, `toolbar.css`, `statusbar.css`, `tabbar.css`.

**State management**: No Redux/global store. Components call the `api` client directly ([apps/web/src/api-client.ts](apps/web/src/api-client.ts)) and manage local state with `useState`/`useEffect`. The only React context is `ThemeProvider`.

### Yjs real-time editing flow
1. User opens document → frontend connects WebSocket to `ws://host/socket?docid=doc-<uuid>&token=<share-token>`
2. yjs-server (`ws-server.ts`) validates the token against backend, initializes a Y.Doc from the file on disk
3. Sends full Yjs state as initial update to the connecting client
4. On each edit: client sends Yjs update → server applies to Y.Doc, broadcasts to other connections on same docId
5. Auto-save timer (5s debounce): `YjsManager.autoSaveDocument()` writes Y.Text content to working tree via `writeFileSync()`. This is NOT a git commit
6. On last disconnect: final flush, then 30-second grace period before Y.Doc is destroyed
7. Document ID convention: `doc-<uuid>` (frontend) maps to `<uuid>.md` on the filesystem

### Commit flow (user-initiated)
1. Frontend calls `POST /api/documents/:id/commit` with `{ message }`
2. Backend acquires Redis distributed lock on the file path (`packages/shared/src/file-lock.ts`)
3. Backend calls `POST yjs-server:1234/internal/flush?docid=doc-<uuid>` to force-write current Yjs state to disk
4. Backend runs `git add <file>` then `git commit -m <message>` with GIT_AUTHOR_* set from user record
5. Releases lock

### Discard flow
1. Frontend calls `POST /api/documents/:id/discard`
2. Backend acquires lock, runs `git checkout HEAD -- <file>` (reverts working tree to last commit)
3. Backend calls `POST yjs-server:1234/internal/reload?docid=doc-<uuid>` to hot-reload Y.Doc from the reverted file
4. All connected clients receive the reverted content in real time

### Internal yjs-server HTTP endpoints

The backend calls these endpoints on yjs-server (port 1234) during git operations. They are NOT exposed through nginx:

- `POST /internal/flush?docid=doc-<uuid>` — force-write current Yjs state to disk (called before git commit)
- `POST /internal/reload?docid=doc-<uuid>` — hot-reload Y.Doc from disk after git revert (called after discard/restore)
- `GET /internal/yjs-session-active?docid=doc-<uuid>` — check if any WebSocket connections are active on this document

### Document naming conventions

- **Frontend document ID**: `doc-<uuid>` (e.g., `doc-550e8400-e29b-41d4-a716-446655440000`)
- **Filesystem path**: `<uuid>.md` — the `doc-` prefix is stripped, `.md` appended
- **Folder path**: kebab-case, sanitized via `sanitizeFileName()` in `document.service.ts` (lowercase, alphanumeric + hyphens only)
- **Git repo root**: `$GIT_REPO_PATH` (default `/var/lib/md-collab/docs/`)

### Folder permission inheritance

Folder permissions use a "walk ancestors, take max" algorithm ([apps/backend/src/services/folder.service.ts](apps/backend/src/services/folder.service.ts)):
- Users with no explicit permission on a folder inherit from the nearest ancestor that has one
- When multiple ancestor folders have permissions, the **highest** level wins (ADMIN > EDIT > VIEW)
- The `effectivePermission` check walks from the target folder up to root, collecting all explicit permissions for the user

### Shared package (`packages/shared/`)
Contains code used by backend, yjs-server, and mcp-server:
- `types.ts` — shared TypeScript interfaces (User, Folder, Document, API error shape)
- `git-service.ts` — `simple-git` wrapper (commit, discard, restore, diff, log, show)
- `file-lock.ts` — Redis-based distributed lock (`acquireLock(path)`, `releaseLock(path)`) used to serialize file access between backend git operations and yjs-server auto-save

## Where things live

- `docs/` — specification suite (01 through 07), the source of truth for what to build
- `docs/plans/` — bite-sized implementation plans from the `writing-plans` workflow
- `apps/backend/` — Fastify REST API, Prisma schema, git operations
- `apps/backend/prisma/schema.prisma` — database schema (users, folders, documents, folder_permissions, shares, uploads, user_quotas)
- `apps/backend/src/services/document.service.ts` — **core business logic**: create, commit, discard, restore, rename, delete documents; coordinates Yjs flush/reload with git operations
- `apps/backend/src/services/auth.service.ts` — JWT sign/verify, password hashing (bcrypt)
- `apps/backend/src/services/folder.service.ts` — folder CRUD with git path management
- `apps/backend/src/services/user.service.ts` — user CRUD, API key generation
- `apps/backend/src/services/minio.service.ts` — MinIO/S3 upload/download/presigned URLs
- `apps/backend/src/services/git-init.ts` — `ensureGitRepo()` auto-initializes the repo on startup
- `apps/backend/src/services/redis-lock.service.ts` — Redis distributed lock for coordinating backend ↔ yjs-server file access
- `apps/backend/src/middleware/auth.ts` — JWT cookie authentication middleware
- `apps/yjs-server/src/ws-server.ts` — WebSocket server (port 1235), connection lifecycle, update broadcast, share token validation
- `apps/yjs-server/src/yjs-manager.ts` — Y.Doc lifecycle (init from file, auto-save, flush, reload), 5s auto-save timer
- `apps/yjs-server/src/server.ts` — Fastify HTTP server (port 1234) with `/internal/*` endpoints
- `apps/mcp-server/` — MCP server (port 3100), stub in Phase 4, full tools in Phase 5
- `apps/web/` — React SPA
- `apps/web/src/api-client.ts` — typed HTTP client wrapping `fetch` for all backend endpoints
- `apps/web/vite.config.ts` — Vite config with dev proxy (`/api`→backend, `/socket`→yjs-server)
- `packages/shared/` — shared types, GitService wrapper, Redis file lock
- `infra/` — docker-compose.yml, nginx.conf, minio init script, .env.example

## Testing

- Unit tests: `*.test.ts` alongside source, run with Vitest
- API tests: `apps/backend/src/routes/documents.test.ts` with Supertest against a test Postgres instance
- E2E: `apps/web/e2e/` with Playwright against the full Docker stack. Includes specs for real-time editing, markdown rendering, shares, uploads, auth, and dashboard. Fixtures are in `apps/web/e2e/fixtures/`.
- Test config: `vitest.config.ts` in each package (or `vitest.config.ts` in `apps/web/`)
- Target coverage: backend 80%+, frontend 60%+
- Baseline rule: never introduce new failing tests. Check baseline before and after changes.
- Backend tests read env from `infra/.env` to set `DATABASE_URL` and `JWT_SECRET` in the test environment. Make sure `infra/.env` exists with valid values before running backend tests.
- E2E tests use Playwright config at [apps/web/e2e/playwright.config.ts](apps/web/e2e/playwright.config.ts)

## Code standards

- TypeScript strict mode, ES2022, NodeNext module resolution (`tsconfig.base.json`). Frontend uses `moduleResolution: "Bundler"` (Vite).
- ESLint linting is JS-only (`eslint.config.js` ignores `*.ts`/`*.tsx`); TypeScript is validated via `pnpm typecheck` (tsc --noEmit) only
- Conventional Commits (e.g. `feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- No `Co-Authored-By` trailer in commits
- TDD where tests exist: write failing test first, then minimal implementation
- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
- No emoji in code, comments, commit messages, or user-facing documentation files (README, CLAUDE.md)

## Security rules

- HTML is disabled in markdown-it (`html: false`). DOMPurify runs on render output as a second layer.
- MIME allowlist for uploads: image/*, application/pdf, text/plain. Max 25 MB.
- JWT secret in env var, length >= 256 bits.
- Share tokens: `crypto.randomBytes(24).toString('base64url')`.
- Never hardcode secrets, API keys, or credentials in source.
