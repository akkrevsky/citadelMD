import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { ensureGitRepo } from './services/git-init.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { folderRoutes } from './routes/folders.js'
import { documentRoutes } from './routes/documents.js'
import { uploadRoutes } from './routes/upload.routes.js'
import { shareRoutes } from './routes/share.routes.js'
import { adminRoutes } from './routes/admin.routes.js'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  // Register plugins
  await app.register(cookie)

  // Health check
  app.get('/api/health', async () => {
    const checks: Record<string, string> = { git: 'ok' }
    return { status: 'ok', version: '0.0.0', checks }
  })

  // Auth routes
  await app.register(authRoutes)

  // User routes (admin-only)
  await app.register(userRoutes)

  // Folder routes
  await app.register(folderRoutes)

  // Document routes
  await app.register(documentRoutes)

  // Upload routes
  await app.register(uploadRoutes)

  // Share routes
  await app.register(shareRoutes)

  // Admin routes
  await app.register(adminRoutes)

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
