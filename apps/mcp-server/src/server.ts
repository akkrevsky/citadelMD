import Fastify, { type FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { BackendClient } from './backend-client.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { resolveApiKey } from './auth.js'
import { buildDescription } from './describe.js'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000'

/**
 * Build a fresh McpServer + BackendClient per request. The apiKey is captured
 * in the BackendClient closure so every tool call forwards the authenticated
 * user to the backend.
 */
function buildMcpServer(apiKey: string): McpServer {
  const backend = new BackendClient(apiKey, BACKEND_URL)
  const server = new McpServer({
    name: 'citadelMD',
    version: '1.0.0',
  })
  registerTools(server, backend)
  registerResources(server, backend)
  return server
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  // Health check (no auth required)
  app.get('/health', async () => {
    return { status: 'ok', service: 'mcp-server' }
  })

  // Self-describing page (no auth required): an agent pointed here can learn
  // how to connect to /mcp on its own. Host/proto come from the request, so
  // the connect snippets always match the public URL.
  app.get('/mcp/description', async (request) => {
    const forwardedProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]
    const proto = forwardedProto ?? 'http'
    const baseUrl = `${proto}://${request.headers.host}`
    const server = buildMcpServer('') // apiKey is unused for introspection
    return buildDescription(server, baseUrl)
  })

  // MCP Streamable HTTP — POST (messages)
  app.post('/mcp', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <apiKey> required' },
      })
      return
    }

    const apiKey = authHeader.slice(7)
    const user = await resolveApiKey(apiKey, BACKEND_URL)
    if (!user) {
      reply.status(401).send({
        error: { code: 'INVALID_API_KEY', message: 'Invalid or inactive API key' },
      })
      return
    }

    request.log.info({ userId: user.id, login: user.login }, 'MCP request authenticated')

    try {
      const mcpServer = buildMcpServer(apiKey)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — each request is independent
      })

      await mcpServer.connect(transport)

      // Hijack the reply so the transport manages the HTTP response directly
      reply.hijack()
      await transport.handleRequest(request.raw, reply.raw, request.body)
    } catch (err: unknown) {
      request.log.error({ err }, 'MCP transport error')
      if (!reply.sent) {
        reply.status(500).send({
          error: { code: 'MCP_ERROR', message: 'Internal MCP server error' },
        })
      }
    }
  })

  // MCP Streamable HTTP — GET (SSE stream for stateful sessions)
  app.get('/mcp', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <apiKey> required' },
      })
      return
    }

    const apiKey = authHeader.slice(7)
    const user = await resolveApiKey(apiKey, BACKEND_URL)
    if (!user) {
      reply.status(401).send({
        error: { code: 'INVALID_API_KEY', message: 'Invalid or inactive API key' },
      })
      return
    }

    try {
      const mcpServer = buildMcpServer(apiKey)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })

      await mcpServer.connect(transport)

      reply.hijack()
      await transport.handleRequest(request.raw, reply.raw, undefined)
    } catch (err: unknown) {
      request.log.error({ err }, 'MCP SSE transport error')
      if (!reply.sent) {
        reply.status(500).send({
          error: { code: 'MCP_ERROR', message: 'Internal MCP server error' },
        })
      }
    }
  })

  return app
}

export async function startServer(): Promise<void> {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3100)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[mcp-server] listening on :${port} — MCP tools active`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('[mcp-server] startup error:', err)
    process.exit(1)
  })
}
