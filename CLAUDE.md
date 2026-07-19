# citadelMD — Project Context for Claude Code

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
- Backend: Node.js 20 + TypeScript + Fastify + Prisma
- Frontend: React + Vite + CodeMirror 6 + y-codemirror.next + markdown-it
- Real-time: Yjs + y-redis
- Storage: Git working repo (content), Postgres 16 (metadata), MinIO (attachments), Redis 7 (cache/locks/pub-sub)
- Tests: Vitest (unit/integration), Supertest (API), Playwright (e2e)
- Linting: ESLint flat config + Prettier

## Key commands

- `pnpm install` — install dependencies
- `pnpm --filter backend dev` — run backend in dev mode
- `pnpm --filter web dev` — run frontend dev server
- `pnpm test` — run all tests
- `pnpm lint` — lint all packages
- `docker compose -f infra/docker-compose.yml up -d` — bring up the full stack
- `docker compose -f infra/docker-compose.yml exec backend npx prisma migrate deploy` — apply migrations

## Code standards

- TypeScript strict mode, ES2022, NodeNext module resolution
- Conventional Commits (e.g. `feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- No `Co-Authored-By` trailer in commits
- TDD where tests exist: write failing test first, then minimal implementation
- 2-space indentation for TypeScript/JavaScript/JSON/YAML
- No emoji in code, comments, commit messages, or user-facing documentation files (README, CLAUDE.md)

## Where things live

- `docs/` — specification suite (01 through 07), the source of truth for what to build
- `docs/plans/` — bite-sized implementation plans from the `writing-plans` workflow
- `apps/backend/` — Fastify REST API, Prisma schema, git operations
- `apps/backend/src/services/git-init.ts` — `ensureGitRepo()` auto-initializes the repo on startup
- `apps/backend/src/services/git.service.ts` — `simple-git` wrapper (commit, discard, restore, diff, log, show)
- `apps/yjs-server/` — y-redis WebSocket gateway with `/internal/flush` and `/internal/reload`
- `apps/mcp-server/` — MCP server (port 3100) with tools for AI agents
- `apps/web/` — React SPA
- `packages/shared/` — shared types, JWT utils, GitService wrapper
- `infra/` — docker-compose.yml, nginx.conf, backup scripts, .env.example

## Testing

- Unit tests: `*.test.ts` alongside source, run with Vitest
- API tests: `apps/backend/test/` with Supertest against a test Postgres instance
- E2E: `apps/web/e2e/` with Playwright against the full Docker stack
- Target coverage: backend 80%+, frontend 60%+
- Baseline rule: never introduce new failing tests. Check baseline before and after changes.

## Security rules

- HTML is disabled in markdown-it (`html: false`). DOMPurify runs on render output as a second layer.
- MIME allowlist for uploads: image/*, application/pdf, text/plain. Max 25 MB.
- JWT secret in env var, length >= 256 bits.
- Share tokens: `crypto.randomBytes(24).toString('base64url')`.
- Never hardcode secrets, API keys, or credentials in source.
