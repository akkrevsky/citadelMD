import Fastify, { type FastifyInstance } from 'fastify'
import { YjsWebSocketServer } from './ws-server.js'

let yjsWS: YjsWebSocketServer

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  // Initialize WebSocket server on port 1235 (HTTP stays on 1234)
  yjsWS = new YjsWebSocketServer(1235)

  app.get('/health', async () => {
    return { status: 'ok', service: 'yjs-server' }
  })

  // Internal endpoint: flush document to file
  app.post('/internal/flush', async (request, reply) => {
    const { docid } = request.query as { docid: string }
    
    if (!docid) {
      reply.code(400)
      return { error: 'Missing docid parameter' }
    }
    
    try {
      yjsWS.getYjsManager().flushDocument(docid)
      return { status: 'flushed', docid }
    } catch (error) {
      reply.code(404)
      return { error: `Document not found: ${docid}` }
    }
  })

  // Internal endpoint: reload document from file  
  app.post('/internal/reload', async (request, reply) => {
    const { docid } = request.query as { docid: string }
    
    if (!docid) {
      reply.code(400)
      return { error: 'Missing docid parameter' }
    }
    
    try {
      yjsWS.getYjsManager().reloadDocument(docid)
      return { status: 'reloaded', docid }
    } catch (error) {
      reply.code(404)
      return { error: `Document not found: ${docid}` }
    }
  })

  // Internal endpoint: check if document has active Yjs sessions
  app.get('/internal/yjs-session-active', async (request, reply) => {
    const { docid } = request.query as { docid: string }
    
    if (!docid) {
      reply.code(400)
      return { error: 'Missing docid parameter' }
    }
    
    const isActive = yjsWS.hasActiveConnections(docid)
    return { docid, active: isActive, connections: isActive ? 1 : 0 }
  })

  return app
}

export async function startServer(): Promise<void> {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 1234)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[yjs-server] listening on :${port} with WebSocket and internal endpoints`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start yjs-server:', err)
    process.exit(1)
  })
}