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
