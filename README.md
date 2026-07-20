# citadelMD

Self-hosted collaborative Markdown editor with real-time CRDT, Git-based versioning, manual commit/discard/restore, and MCP server for AI agents.

Status: **Phase 3 Complete** (2026-07-20). Real-time collaborative editing now available.

## What this is

A web-based collaborative Markdown editor for a ~10-person team, deployed on a self-managed VPS. Built by code agents (Claude Code on GLM-5.2) following the specification suite under `docs/`.

Key characteristics:

- Pure Markdown files stored in a Git working repo on the server filesystem
- Real-time co-editing via Yjs CRDT (cursor-level, character-by-character merge)
- Auto-save every 5 seconds to the working tree (edits survive crashes)
- Manual commit — the user decides when to create a versioned snapshot, not every keystroke
- Discard — revert uncommitted edits back to the last commit
- Restore — bring back any historical version
- Git-style diffs between any two versions (added/removed lines)
- MCP server so AI agents (Codex, Claude, others) can read, search, create, and update documents
- Roles: ADMIN / EDITOR / VIEWER
- Public share links with TTL and read/write permissions
- 8 Markdown extensions: Mermaid, KaTeX, code highlight, embeds, tables, callouts, task-lists, footnotes
- Attachments via drag-n-drop and paste-image, stored in MinIO/S3 (200 GB)
- Docker Compose deployment, 6 services, one-command bring-up

## Tech stack

| Component | Choice |
|---|---|
| Frontend | React + Vite + CodeMirror 6 + y-codemirror.next + markdown-it |
| Backend | Node.js 20 + TypeScript + Fastify + Prisma |
| Real-time | Yjs + y-redis (WebSocket gateway, ephemeral) |
| MCP Server | Node.js + TypeScript + HTTP+SSE transport |
| Content storage | Git working repo on FS (`/var/lib/md-collab/docs/`) |
| Metadata storage | PostgreSQL 16 |
| Attachments | MinIO (S3) |
| Cache / locks / pub-sub | Redis 7 |
| Reverse proxy | Nginx (TLS, WebSocket) |
| Auth | JWT in httpOnly cookie + API key for MCP |
| Package manager | pnpm (workspace monorepo) |

## Specification

The full specification lives under `docs/` and is the source of truth for implementation:

| File | Contents |
|---|---|
| [docs/01-requirements.md](docs/01-requirements.md) | Functional and non-functional requirements |
| [docs/02-tech-stack-options.md](docs/02-tech-stack-options.md) | Stack comparison and locked decisions |
| [docs/03-architecture.md](docs/03-architecture.md) | Components, data flows, save model (auto-save + manual commit) |
| [docs/04-database-schema.md](docs/04-database-schema.md) | Postgres/Prisma schema (metadata only, no content_md) |
| [docs/05-api-contracts.md](docs/05-api-contracts.md) | REST + WS protocol + commit/discard/restore + MCP tools |
| [docs/06-infra-deploy.md](docs/06-infra-deploy.md) | Docker Compose, Nginx, Git auto-init, backup scripts |
| [docs/07-agent-roadmap.md](docs/07-agent-roadmap.md) | 7 phases for code agents (Phase 0-6) |

Detailed bite-sized implementation plans (produced by the `writing-plans` workflow) live under `docs/plans/`.

## Phase 3 - Real-time Collaborative Editing ✅

- **Yjs Integration**: Real-time CRDT-based collaborative editing
- **CodeMirror 6**: Modern code editor with Markdown support
- **WebSocket Gateway**: Live document synchronization via y-redis
- **Auto-save**: Changes saved to working tree every 5 seconds
- **Manual Commit**: User-controlled versioning with commit messages
- **Discard Changes**: Rollback to last committed version
- **Distributed Locking**: Redis-based file locking for safe operations
- **Connection Status**: Real-time connection indicators

### Usage

1. Navigate to Dashboard
2. Click "Edit" on any document
3. Start typing - changes sync in real-time with other users
4. Use "Commit" button to save versions to Git history
5. Use "Discard Changes" to rollback unsaved changes

## Architecture decisions (v3, 2026-07-19)

1. Source of truth = Git HEAD. The working tree is a scratchpad with uncommitted auto-saved edits.
2. Yjs is ephemeral — initialized from the working tree on open, debounced auto-save every 5s.
3. Manual commit — a "Save version" button triggers `git add + git commit` with GIT_AUTHOR_* from the user.
4. Discard — `git checkout HEAD -- <file>` reverts uncommitted edits.
5. Restore — `git checkout <sha> -- <file>` plus a new commit brings back an old version.
6. MCP server — separate service on port 3100, Bearer API key auth, tools for AI agents.
7. Web-only — no Obsidian, no SSH, no local files, no file watcher, no external-source reconciliation. Editing happens in the browser only.

## Development

This project is built by code agents following the superpowers methodology:
`spec-authoring` -> `writing-plans` -> `subagent-driven-development` -> `requesting-code-review`.

Active agent: Claude Code v2.x backed by ZAI GLM-5.2 via the Anthropic-compatible endpoint.

To run Phase 0 (scaffolding) locally:

```bash
cd /home/sp/workspace/citadelMD
PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH" \
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
claude -p "Implement the plan in docs/plans/2026-07-20-phase-0-scaffolding.md" \
  --settings ~/.claude/profiles/glm.json \
  --max-turns 50
```

## License

TBD.
