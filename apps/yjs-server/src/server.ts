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
