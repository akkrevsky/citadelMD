# citadelMD

Self-hosted collaborative Markdown editor with real-time CRDT editing, Git-based versioning, and an MCP server for AI agents. Designed for a small team running on a single VPS.

Content lives as plain `.md` files in a Git working repo. Edits sync in real time, auto-save to disk every few seconds, and snapshots are created on demand with a manual commit — not on every keystroke.

---

## Features

- **Real-time co-editing** — character-level CRDT merge via Yjs; live cursors and presence for multiple editors and guests
- **Git-based versioning** — manual commit, discard uncommitted changes, restore any past revision, diff between versions
- **Markdown editor** — CodeMirror 6 with split editor/preview, dark and light themes
- **Rich rendering** — code highlighting (Prism), Mermaid diagrams, KaTeX math, GFM tables, task lists, callouts, footnotes, embeds
- **Excalidraw whiteboards** embedded in documents
- **Attachments** — drag-and-drop and paste-image upload to MinIO/S3, per-user storage quotas
- **Roles & permissions** — ADMIN / EDITOR / VIEWER with folder hierarchy and inherited permissions
- **Public share links** — time-limited, read or read/write, guest sees a single document only
- **MCP server** — lets AI agents read, search, create, and update documents over an API key

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React, Vite, CodeMirror 6, y-codemirror.next, markdown-it, DOMPurify |
| Backend | Node.js 20, TypeScript, Fastify, Prisma |
| Real-time | Yjs, y-redis (ephemeral WebSocket gateway) |
| MCP server | Node.js, TypeScript, HTTP + SSE |
| Content storage | Git working repo on the filesystem |
| Metadata | PostgreSQL 16 |
| Attachments | MinIO (S3) |
| Cache / locks / pub-sub | Redis 7 |
| Reverse proxy | nginx (TLS, WebSocket) |
| Auth | JWT in httpOnly cookie + API key for MCP |
| Monorepo | pnpm workspaces |

## Architecture

```
                          Browser (SPA)
                  React + CodeMirror 6 + Yjs
              REST (cookie JWT)   |   WSS (real-time)
                     v            v        v
                  nginx (reverse proxy, TLS)
            /api -> backend   /socket -> yjs-server   / -> SPA
                     |                       |
                     v                       v
        Backend (Fastify)          Yjs WebSocket Server
        - REST API /api/*          - CRDT sync (ephemeral)
        - Git ops (simple-git)     - init from file on open
        - uploads -> MinIO         - auto-save to working tree (5s)
        - commit / discard /       - flush / reload on demand
          restore / diff
                     |
        +------------+------------+
        v            v            v
     Redis        Postgres       MinIO
   locks/cache    metadata       attachments
```

The source of truth for document content is **Git HEAD**. Postgres holds metadata only (no document content column). Yjs state is ephemeral — initialized from the working tree on open, never persisted to the database. Backend mutations (commit / discard / restore) and Yjs auto-save serialize through a Redis distributed lock on the file path.

The full design lives in [docs/](docs/).

## Quick start (Docker)

Requires Docker and Docker Compose.

```bash
cd infra
cp .env.example .env        # then edit secrets
docker compose up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

Then open http://localhost (nginx) and log in:

- **Login:** `admin`
- **Password:** the value of `ADMIN_PASSWORD` in your `.env`

Other entry points while developing through the override file:

- http://localhost:8081 — web (Vite-style prod build served by container nginx)
- http://localhost:3000/api/health — backend health check
- http://localhost:9001 — MinIO console

For local dev with hot reload, see [Local development](#local-development).

### Ports

| Port | Service | Notes |
|---|---|---|
| 80 / 443 | nginx | Reverse proxy, TLS, path-based routing |
| 3000 | backend | Fastify REST API |
| 1234 | yjs-server (HTTP) | Health + internal `/internal/*` endpoints |
| 1235 | yjs-server (WS) | Yjs sync — nginx proxies `/socket` here |
| 3100 | mcp-server | MCP tools for agents over `/mcp` |
| 8081 | web | Production build (dev port exposure) |
| 5173 | web (dev) | Vite dev server |
| 9001 | MinIO console | Web UI for object storage |

## Configuration

All configuration is via environment variables. See [infra/.env.example](infra/.env.example) for a template and [infra/.env.complete](infra/.env.complete) for the fully annotated reference.

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Postgres password (required for the DB container) |
| `JWT_SECRET` | JWT signing secret, 256 bits or longer |
| `ADMIN_PASSWORD` | Initial admin user password, created on first seed |
| `GIT_REPO_HOST_PATH` | Host path mounted as the Git working repo (default `/var/lib/md-collab/docs`) |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO credentials |
| `MINIO_BUCKET` | MinIO bucket for uploads (default `md-collab-uploads`) |
| `PUBLIC_BASE_URL` | Public base URL for share links |
| `GIT_REMOTE_MIRROR_URL` | Optional remote Git mirror for backups |
| `DATABASE_URL` | Postgres connection string (backend, mcp-server) |
| `REDIS_URL` | Redis connection string (backend, yjs-server) |
| `YJS_SERVER_URL` | yjs-server internal HTTP URL (backend) |

Helper scripts in [infra/](infra/):

- `make up` / `make down` / `make logs` — compose lifecycle (run from `infra/`)
- `make migrate` / `make seed` — database setup
- `make backup` — Postgres dump + Git mirror push
- [infra/start.sh](infra/start.sh) — one-shot bring-up script that copies `.env` if missing and waits for health

## Local development

Requires Node.js 20 and pnpm 9+.

```bash
pnpm install

# Run each service in its own terminal:
pnpm --filter backend dev      # Fastify on :3000
pnpm --filter yjs-server dev   # yjs-server HTTP :1234 + WS :1235
pnpm --filter web dev          # Vite on :5173 (proxies /api and /socket)
pnpm --filter mcp-server dev   # MCP server on :3100

# Or everything at once:
pnpm dev
```

The web dev server proxies `/api` to the backend and `/socket` to yjs-server. You still need Postgres, Redis, and MinIO running — bring up just the data services:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio minio-init
```

### Common commands

```bash
pnpm typecheck                                # tsc --noEmit across all packages
pnpm lint                                     # ESLint (JS files; TS is checked via typecheck)
pnpm build                                    # build all packages
pnpm test                                     # run all tests
pnpm --filter backend exec vitest run path/to/file.test.ts   # single test file
```

### Prisma

```bash
pnpm --filter backend exec npx prisma migrate dev     # create + apply a migration
pnpm --filter backend exec npx prisma generate        # regenerate the client after schema changes
```

## Project structure

```
apps/
  backend/      Fastify REST API, Prisma schema, Git operations
  yjs-server/   WebSocket gateway, Y.Doc lifecycle, auto-save
  mcp-server/   MCP tools for AI agents
  web/          React SPA (editor, preview, dashboard)
packages/
  shared/       Shared types, GitService wrapper, Redis file lock
docs/           Specification suite (01-07) — the source of truth
infra/          Docker Compose, nginx, env templates, Makefile, backup scripts
```

## Testing

- **Unit / integration** — Vitest, `*.test.ts` next to source
- **API** — Supertest against a Postgres test instance ([apps/backend/src/routes/](apps/backend/src/routes/))
- **E2E** — Playwright against the full Docker stack ([apps/web/e2e/](apps/web/e2e/)): real-time editing, markdown rendering, shares, uploads, auth, dashboard

```bash
pnpm test
pnpm --filter backend test
pnpm --filter web exec vitest run
```

Backend tests read `DATABASE_URL` and `JWT_SECRET` from [infra/.env](infra/.env) — make sure it exists before running them.

## Documentation

The specification under [docs/](docs/) is the source of truth for implementation:

| File | Contents |
|---|---|
| [01-requirements.md](docs/01-requirements.md) | Functional and non-functional requirements |
| [02-tech-stack-options.md](docs/02-tech-stack-options.md) | Stack comparison and locked decisions |
| [03-architecture.md](docs/03-architecture.md) | Components, data flows, save model |
| [04-database-schema.md](docs/04-database-schema.md) | Postgres / Prisma schema |
| [05-api-contracts.md](docs/05-api-contracts.md) | REST + WebSocket protocol + MCP tools |
| [06-infra-deploy.md](docs/06-infra-deploy.md) | Docker, nginx, Git auto-init, backups |
| [07-agent-roadmap.md](docs/07-agent-roadmap.md) | Implementation phases |

[CLAUDE.md](CLAUDE.md) documents the architecture and working conventions for code agents.

## Status

Core editing, real-time collaboration, Git versioning, markdown rendering, attachments, and sharing are implemented. The MCP server is a stub pending the agent-tools phase.

## License

BSD-3-Clause. See [LICENSE](LICENSE).
