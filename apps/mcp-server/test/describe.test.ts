/**
 * Self-describing endpoint: an agent pointed at GET /mcp/description should
 * be able to figure out how to connect to this MCP server on its own.
 */
import { describe, it, expect } from 'vitest'
import { buildServer } from '../src/server.js'

describe('GET /mcp/description', () => {
  it('returns self-describing JSON with tools and connect examples', async () => {
    const app = await buildServer()
    const res = await app.inject({
      method: 'GET',
      url: '/mcp/description',
      headers: { host: 'md.example.ru', 'x-forwarded-proto': 'https' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.service).toContain('citadelMD')
    expect(body.transport).toBe('streamable-http')
    expect(body.endpoints.mcp).toBe('https://md.example.ru/mcp')
    expect(body.auth).toMatchObject({ header: 'Authorization', scheme: 'Bearer' })
    expect(body.tools.length).toBeGreaterThan(5)
    expect(body.tools.map((t: { name: string }) => t.name)).toContain('list_folders')

    const listFolders = body.tools.find((t: { name: string }) => t.name === 'list_folders')
    expect(listFolders.inputSchema.type).toBe('object')
    expect(listFolders.description.length).toBeGreaterThan(0)

    expect(body.connect.claude_code_command).toContain('https://md.example.ru/mcp')
    expect(body.connect.mcp_json.mcpServers.citadelMD.url).toBe('https://md.example.ru/mcp')

    expect(body.resources.map((r: { uri: string }) => r.uri)).toContain('md-collab://documents/{id}')
    expect(body.resources.length).toBeGreaterThanOrEqual(3)

    await app.close()
  })
})
