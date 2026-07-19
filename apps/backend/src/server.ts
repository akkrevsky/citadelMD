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
