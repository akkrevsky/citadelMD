# Phase 0 — Scaffolding & Infra Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Stand up the monorepo skeleton and the full Docker Compose stack so that `docker compose up -d` brings up all services with passing health checks and a working `GET /api/health` endpoint.

**Architecture:** pnpm workspace monorepo with four app packages (`apps/backend`, `apps/yjs-server`, `apps/mcp-server`, `apps/web`) and one shared library (`packages/shared`). Backend auto-initializes the Git working repo on first startup. Docker Compose orchestrates six runtime services plus a one-shot MinIO init container.

**Tech Stack:** pnpm 9, Node.js 20, TypeScript 5 (strict), Fastify 4, Prisma 5, Vitest 1, ESLint 9 (flat), Prettier 3, Docker Compose v3.9, Nginx, Postgres 16, Redis 7, MinIO.

**Context for the implementer:** Read `docs/06-infra-deploy.md` (sections 1-6) and `docs/03-architecture.md` (sections 1-2) before starting. This plan touches ONLY infrastructure and scaffolding — no business logic, no auth, no Yjs.

**Branch:** create `phase-0` from `main`. Commit after every task. Conventional Commits, no Co-Authored-By.

---

## Task 1: Create root workspace files

**Objective:** Establish the pnpm workspace root with base configs.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`

**Step 1: Write root `package.json`**

```json
{
  "name": "citadelmd",
  "private": true,
  "version": "0.0.0",
  "description": "Self-hosted collaborative Markdown editor",
  "license": "TBD",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

**Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 4: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

**Step 5: Write `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 6: Write `eslint.config.js`**

```javascript
import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { node: true },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
]
```

**Step 7: Verify**

Run: `pnpm install`
Expected: installs without error, creates `pnpm-lock.yaml`.

**Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .editorconfig .prettierrc.json eslint.config.js pnpm-lock.yaml
git commit -m "chore: add root workspace config files"
```

---

## Task 2: Create `packages/shared` package skeleton

**Objective:** Establish the shared types and utilities package.

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`

**Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@citadelmd/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "simple-git": "^3.25.0"
  }
}
```

**Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

**Step 3: Write `packages/shared/src/types.ts`**

Core domain types derived from `docs/04-database-schema.md`:

```typescript
export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type FolderPermissionLevel = 'VIEW' | 'EDIT' | 'ADMIN'

export type SharePermission = 'READ' | 'WRITE'

export interface User {
  id: string
  login: string
  role: UserRole
  displayName: string | null
  gitName: string | null
  gitEmail: string | null
  apiKey: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Folder {
  id: string
  parentId: string | null
  name: string
  gitPath: string
  createdAt: Date
  createdById: string | null
}

export interface Document {
  id: string
  folderId: string
  title: string
  filePath: string
  createdAt: Date
  updatedAt: Date
  createdById: string | null
}

export interface ApiError {
  error: { code: string; message: string }
}
```

**Step 4: Write `packages/shared/src/index.ts`**

```typescript
export * from './types.js'
```

**Step 5: Verify**

Run: `pnpm install && pnpm --filter @citadelmd/shared typecheck`
Expected: typecheck passes with zero errors.

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "chore: add @citadelmd/shared package skeleton"
```

---

## Task 3: Create `GitService` wrapper in `packages/shared`

**Objective:** Thin wrapper over `simple-git` providing commit, discard, restore, diff, log, show methods.

**Files:**
- Create: `packages/shared/src/git-service.ts`
- Create: `packages/shared/src/git-service.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write failing test `packages/shared/src/git-service.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GitService } from './git-service.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'citadelmd-git-test-'))
const git = new GitService(tmp)

beforeAll(async () => {
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@citadelmd.local')
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('GitService', () => {
  it('creates a commit and it appears in log', async () => {
    await fs.writeFile(path.join(tmp, 'doc1.md'), '# Hello')
    await git.commit('doc1.md', 'Create doc1', { name: 'Test', email: 'test@citadelmd.local' })
    const log = await git.log('doc1.md')
    expect(log.total).toBe(1)
    expect(log.latest!.message).toContain('Create doc1')
  })

  it('discard reverts uncommitted changes to HEAD', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nUncommitted line')
    await git.discard('doc1.md')
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).not.toContain('Uncommitted line')
  })

  it('restore brings back an old version', async () => {
    const log = await git.log('doc1.md')
    const firstSha = log.latest!.sha
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nVersion 2')
    await git.commit('doc1.md', 'Add v2', { name: 'Test', email: 'test@citadelmd.local' })
    await git.restore('doc1.md', firstSha)
    await git.commit('doc1.md', 'Restore to v1', { name: 'Test', email: 'test@citadelmd.local' })
    const content = await fs.readFile(path.join(tmp, 'doc1.md'), 'utf-8')
    expect(content).toContain('Hello')
    expect(content).not.toContain('Version 2')
  })

  it('diffUncommitted returns empty when no changes', async () => {
    const diff = await git.diffUncommitted('doc1.md')
    expect(diff).toBe('')
  })

  it('diffUncommitted shows added/removed lines', async () => {
    await fs.appendFile(path.join(tmp, 'doc1.md'), '\nNew uncommitted')
    const diff = await git.diffUncommitted('doc1.md')
    expect(diff).toContain('+New uncommitted')
  })
})
```

**Step 2: Run test to verify failure**

Run: `pnpm --filter @citadelmd/shared test`
Expected: FAIL — `GitService` not found.

**Step 3: Write implementation `packages/shared/src/git-service.ts`**

```typescript
import simpleGit, { type SimpleGit } from 'simple-git'

export interface GitAuthor {
  name: string
  email: string
}

export interface GitLogEntry {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

export interface GitLogResult {
  total: number
  latest: GitLogEntry | null
  all: GitLogEntry[]
}

export class GitService {
  private git: SimpleGit

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async init(): Promise<void> {
    await this.git.init()
  }

  async addConfig(key: string, value: string): Promise<void> {
    await this.git.addConfig(key, value)
  }

  async commit(filePath: string, message: string, author: GitAuthor): Promise<string> {
    await this.git.add(filePath)
    const result = await this.git.commit(message, filePath, {
      '--author': `${author.name} <${author.email}>`,
    })
    return result.commit
  }

  async discard(filePath: string): Promise<void> {
    await this.git.checkout(['HEAD', '--', filePath])
  }

  async restore(filePath: string, sha: string): Promise<void> {
    await this.git.checkout([sha, '--', filePath])
  }

  async log(filePath: string): Promise<GitLogResult> {
    const result = await this.git.log({ file: filePath })
    return {
      total: result.total,
      latest: result.latest
        ? {
            sha: result.latest.sha,
            message: result.latest.message,
            authorName: result.latest.author_name,
            authorEmail: result.latest.author_email,
            date: result.latest.date,
          }
        : null,
      all: result.all.map((e) => ({
        sha: e.sha,
        message: e.message,
        authorName: e.author_name,
        authorEmail: e.author_email,
        date: e.date,
      })),
    }
  }

  async diffUncommitted(filePath: string): Promise<string> {
    return this.git.diff(['HEAD', '--', filePath])
  }

  async diff(filePath: string, fromSha: string, toSha: string): Promise<string> {
    return this.git.diff([fromSha, toSha, '--', filePath])
  }

  async show(sha: string, filePath: string): Promise<string> {
    return this.git.show([`${sha}:${filePath}`])
  }
}
```

**Step 4: Update `packages/shared/src/index.ts`**

```typescript
export * from './types.js'
export * from './git-service.js'
```

**Step 5: Run test to verify pass**

Run: `pnpm --filter @citadelmd/shared test`
Expected: PASS — 5 tests pass.

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add GitService wrapper over simple-git"
```

---

## Task 4: Create `apps/backend` package skeleton

**Objective:** Establish the Fastify backend package with a health endpoint.

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/src/index.ts`
- Create: `apps/backend/src/server.ts`
- Create: `apps/backend/Dockerfile`

**Step 1: Write `apps/backend/package.json`**

```json
{
  "name": "@citadelmd/backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@citadelmd/shared": "workspace:*",
    "@prisma/client": "^5.18.0",
    "fastify": "^4.28.0",
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.4.0",
    "ioredis": "^5.4.1",
    "minio": "^8.0.1",
    "dotenv": "^16.4.5",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "prisma": "^5.18.0",
    "tsx": "^4.16.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.6"
  }
}
```

**Step 2: Write `apps/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Write `apps/backend/src/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify'
import { ensureGitRepo } from './services/git-init.js'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  app.get('/api/health', async () => {
    const checks: Record<string, string> = { git: 'ok' }
    return { status: 'ok', version: '0.0.0', checks }
  })

  return app
}

export async function startServer(): Promise<void> {
  const repoPath = process.env.GIT_REPO_PATH
  if (!repoPath) throw new Error('GIT_REPO_PATH env var is required')

  await ensureGitRepo(repoPath)

  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
```

**Step 4: Write `apps/backend/src/index.ts`**

```typescript
import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('Failed to start backend:', err)
  process.exit(1)
})
```

**Step 5: Write `apps/backend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/backend build
RUN pnpm --filter @citadelmd/backend --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
COPY apps/backend/prisma ./prisma
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["sh", "-c", "node dist/index.js"]
```

**Step 6: Commit**

```bash
git add apps/backend/
git commit -m "feat: add @citadelmd/backend skeleton with health endpoint"
```

---

## Task 5: Create `ensureGitRepo()` auto-init service

**Objective:** Backend auto-initializes the Git working repo on first startup.

**Files:**
- Create: `apps/backend/src/services/git-init.ts`
- Create: `apps/backend/src/services/git-init.test.ts`

**Step 1: Write failing test `apps/backend/src/services/git-init.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { ensureGitRepo } from './git-init.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'citadelmd-gitinit-'))
const repoPath = path.join(tmpRoot, 'docs')

describe('ensureGitRepo', () => {
  it('initializes a new repo with initial commit', async () => {
    await ensureGitRepo(repoPath)
    const gitDir = path.join(repoPath, '.git')
    const stat = await fs.stat(gitDir)
    expect(stat.isDirectory()).toBe(true)

    const readme = await fs.readFile(path.join(repoPath, 'README.md'), 'utf-8')
    expect(readme).toContain('citadelMD Documents')
  })

  it('is idempotent — second call is a no-op', async () => {
    await expect(ensureGitRepo(repoPath)).resolves.not.toThrow()
  })
})

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})
```

**Step 2: Run test to verify failure**

Run: `pnpm --filter @citadelmd/backend test`
Expected: FAIL — module not found.

**Step 3: Write implementation `apps/backend/src/services/git-init.ts`**

```typescript
import { GitService } from '@citadelmd/shared'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureGitRepo(repoPath: string): Promise<void> {
  const gitDir = path.join(repoPath, '.git')
  try {
    await fs.access(gitDir)
    console.log(`[git-init] Repo already exists at ${repoPath}`)
    return
  } catch {
    // .git does not exist — initialize
  }

  console.log(`[git-init] Initializing git repo at ${repoPath}`)
  await fs.mkdir(repoPath, { recursive: true })

  const git = new GitService(repoPath)
  await git.init()
  await git.addConfig('user.name', 'citadelMD System')
  await git.addConfig('user.email', 'system@citadelmd.local')

  await fs.writeFile(path.join(repoPath, 'README.md'), '# citadelMD Documents\n')
  await git.commit('README.md', 'Initial commit', {
    name: 'citadelMD System',
    email: 'system@citadelmd.local',
  })

  console.log('[git-init] Git repo initialized')
}
```

**Step 4: Run test to verify pass**

Run: `pnpm --filter @citadelmd/backend test`
Expected: PASS — 2 tests pass.

**Step 5: Commit**

```bash
git add apps/backend/src/services/
git commit -m "feat: add ensureGitRepo auto-init service"
```

---

## Task 6: Create `apps/yjs-server` package skeleton

**Objective:** Establish the yjs-server package with a health endpoint.

**Files:**
- Create: `apps/yjs-server/package.json`
- Create: `apps/yjs-server/tsconfig.json`
- Create: `apps/yjs-server/src/index.ts`
- Create: `apps/yjs-server/src/server.ts`
- Create: `apps/yjs-server/Dockerfile`

**Step 1: Write `apps/yjs-server/package.json`**

```json
{
  "name": "@citadelmd/yjs-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "@citadelmd/shared": "workspace:*",
    "fastify": "^4.28.0",
    "yjs": "^13.6.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0",
    "@types/ws": "^8.5.10"
  }
}
```

**Step 2: Write `apps/yjs-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Write `apps/yjs-server/src/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  app.get('/health', async () => {
    return { status: 'ok', service: 'yjs-server' }
  })

  return app
}

export async function startServer(): Promise<void> {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 1234)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[yjs-server] listening on :${port} (health only, WS in Phase 3)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start yjs-server:', err)
    process.exit(1)
  })
}
```

**Step 4: Write `apps/yjs-server/src/index.ts`**

```typescript
import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('[yjs-server] startup error:', err)
  process.exit(1)
})
```

**Step 5: Write `apps/yjs-server/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/yjs-server ./apps/yjs-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/yjs-server build
RUN pnpm --filter @citadelmd/yjs-server --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 1234
CMD ["node", "dist/index.js"]
```

**Step 6: Commit**

```bash
git add apps/yjs-server/
git commit -m "feat: add @citadelmd/yjs-server skeleton with health endpoint"
```

---

## Task 7: Create `apps/mcp-server` package skeleton

**Objective:** Establish the MCP server package with a health endpoint.

**Files:**
- Create: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/tsconfig.json`
- Create: `apps/mcp-server/src/index.ts`
- Create: `apps/mcp-server/src/server.ts`
- Create: `apps/mcp-server/Dockerfile`

**Step 1: Write `apps/mcp-server/package.json`**

```json
{
  "name": "@citadelmd/mcp-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "@citadelmd/shared": "workspace:*",
    "fastify": "^4.28.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0"
  }
}
```

**Step 2: Write `apps/mcp-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Write `apps/mcp-server/src/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  app.get('/health', async () => {
    return { status: 'ok', service: 'mcp-server' }
  })

  return app
}

export async function startServer(): Promise<void> {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3100)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[mcp-server] listening on :${port} (health only, MCP tools in Phase 5)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start mcp-server:', err)
    process.exit(1)
  })
}
```

**Step 4: Write `apps/mcp-server/src/index.ts`**

```typescript
import 'dotenv/config'
import { startServer } from './server.js'

startServer().catch((err) => {
  console.error('[mcp-server] startup error:', err)
  process.exit(1)
})
```

**Step 5: Write `apps/mcp-server/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/mcp-server ./apps/mcp-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/mcp-server build
RUN pnpm --filter @citadelmd/mcp-server --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3100
CMD ["node", "dist/index.js"]
```

**Step 6: Commit**

```bash
git add apps/mcp-server/
git commit -m "feat: add @citadelmd/mcp-server skeleton with health endpoint"
```

---

## Task 8: Create `apps/web` package skeleton

**Objective:** Establish the React frontend package.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/Dockerfile`
- Create: `apps/web/nginx.conf`

**Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@citadelmd/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

**Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 3: Write `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket': { target: 'http://localhost:1234', ws: true },
    },
  },
})
```

**Step 4: Write `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>citadelMD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Write `apps/web/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 6: Write `apps/web/src/App.tsx`**

```tsx
export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>citadelMD</h1>
      <p>Self-hosted collaborative Markdown editor.</p>
      <p>Phase 0 scaffolding placeholder.</p>
    </div>
  )
}
```

**Step 7: Write `apps/web/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Step 8: Write `apps/web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat: add @citadelmd/web skeleton with React + Vite"
```

---

## Task 9: Create Prisma schema (empty) and migration setup

**Objective:** Set up Prisma with an empty schema and migration directory. Business tables come in Phase 1.

**Files:**
- Create: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/src/prisma.ts`

**Step 1: Write `apps/backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Step 2: Write `apps/backend/src/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Step 3: Verify**

Run: `pnpm --filter @citadelmd/backend exec npx prisma generate`
Expected: Prisma Client generated, no errors.

**Step 4: Commit**

```bash
git add apps/backend/prisma/ apps/backend/src/prisma.ts
git commit -m "feat: add Prisma setup with empty schema"
```

---

## Task 10: Create Docker Compose stack

**Objective:** Stand up all six runtime services plus MinIO init in Docker Compose.

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/nginx/nginx.conf`
- Create: `infra/minio/init.sh`
- Create: `infra/.env.example`
- Create: `infra/Makefile`

**Step 1: Write `infra/.env.example`**

```env
# Postgres
POSTGRES_DB=mdcollab
POSTGRES_USER=mdcollab
POSTGRES_PASSWORD=change_me_to_long_random_string

# MinIO
MINIO_ROOT_USER=mdcollab
MINIO_ROOT_PASSWORD=change_me_to_long_random_string
MINIO_BUCKET=md-collab-uploads

# JWT
JWT_SECRET=generate_with_openssl_rand_hex_32

# Initial admin
ADMIN_PASSWORD=change_me_initial

# Git repo (host path)
GIT_REPO_HOST_PATH=/var/lib/md-collab/docs

# Public URL
PUBLIC_BASE_URL=https://md.example.com

# Remote Git mirror (backup)
GIT_REMOTE_MIRROR_URL=
```

**Step 2: Write `infra/docker-compose.yml`**

```yaml
version: "3.9"
name: citadelmd
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
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks: [internal]

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
    depends_on: [backend, yjs-server, mcp-server, web]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    networks: [internal]
```

**Step 3: Write `infra/nginx/nginx.conf`**

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;
  keepalive_timeout 65;
  client_max_body_size 30M;

  upstream backend { server backend:3000; }
  upstream yjs_server { server yjs-server:1234; }
  upstream mcp_server { server mcp-server:3100; }
  upstream web { server web:80; }

  server {
    listen 80;
    server_name _;
    # Phase 0: plain HTTP (no TLS yet). TLS added in Phase 6.

    location = /api/auth/login {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/ {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /mcp {
      proxy_pass http://mcp_server;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }
    location /socket {
      proxy_pass http://yjs_server;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }
    location / {
      proxy_pass http://web;
      proxy_set_header Host $host;
    }
  }
}
```

**Step 4: Write `infra/minio/init.sh`**

```bash
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

**Step 5: Write `infra/Makefile`**

```makefile
.PHONY: install dev build up down logs ps migrate seed backup

install:
	cd .. && pnpm install && pnpm -r build

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

**Step 6: Commit**

```bash
git add infra/
git commit -m "feat: add Docker Compose stack and infra files"
```

---

## Task 11: Integration smoke test — bring up the stack

**Objective:** Verify the entire Phase 0 scaffolding works end-to-end.

**Step 1: Copy .env.example to .env and fill in real values**

```bash
cd infra
cp .env.example .env
# Edit .env:
#   POSTGRES_PASSWORD=<random 32 chars>
#   MINIO_ROOT_PASSWORD=<random 32 chars>
#   JWT_SECRET=<openssl rand -hex 32>
#   ADMIN_PASSWORD=<random>
#   GIT_REPO_HOST_PATH=/tmp/citadelmd-test-docs  (use a temp path for the test)
#   PUBLIC_BASE_URL=http://localhost
```

**Step 2: Build and start the stack**

```bash
docker compose up -d --build
```

Expected: all services start. Healthchecks pass within ~60 seconds.

**Step 3: Verify health endpoints**

```bash
curl -s http://localhost/api/health | python3 -m json.tool
# Expected: {"status": "ok", "version": "0.0.0", "checks": {"git": "ok"}}

docker compose exec mcp-server wget -qO- http://localhost:3100/health
# Expected: {"status":"ok","service":"mcp-server"}

docker compose exec yjs-server wget -qO- http://localhost:1234/health
# Expected: {"status":"ok","service":"yjs-server"}
```

**Step 4: Verify the working repo was created on the host**

```bash
ls -la /tmp/citadelmd-test-docs
# Expected: .git/ and README.md present

git -C /tmp/citadelmd-test-docs log --oneline
# Expected: one commit "Initial commit"
```

**Step 5: Tear down**

```bash
docker compose down -v
rm -rf /tmp/citadelmd-test-docs
```

**Step 6: Commit test results** (document in commit message)

```bash
git commit --allow-empty -m "test: Phase 0 smoke test passed — all services healthy"
```

---

## Acceptance Criteria Summary

After all 11 tasks are complete:

- [ ] `pnpm install` at root installs all workspaces without error
- [ ] `pnpm -r typecheck` passes with zero errors
- [ ] `pnpm -r test` passes (GitService tests + ensureGitRepo test pass)
- [ ] `docker compose -f infra/docker-compose.yml up -d` brings up all services
- [ ] All healthchecks pass within 60 seconds
- [ ] `curl http://localhost/api/health` returns `{"status":"ok",...}`
- [ ] Git working repo is auto-created at `$GIT_REPO_HOST_PATH` with an initial commit
- [ ] No emoji in code, comments, commit messages, or documentation files
- [ ] Conventional Commits used throughout, no Co-Authored-By trailer
- [ ] One commit per task (11 commits total)
