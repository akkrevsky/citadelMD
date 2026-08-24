import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { aiRoutes } from './ai.js'

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async () => undefined,
}))

describe('POST /api/ai/chat', () => {
  let app: FastifyInstance
  const mockFetch = vi.fn()

  beforeEach(async () => {
    mockFetch.mockClear()
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_BASE_URL = 'https://api.example.com/anthropic'
    process.env.ANTHROPIC_AUTH_TOKEN = 'test-token'
    process.env.ANTHROPIC_MODEL = 'test-model'

    app = Fastify({ logger: false })
    await app.register(aiRoutes)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await app.close()
  })

  it('proxies messages and returns the concatenated text blocks', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: 'internal' },
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      }),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).text).toBe('Hello world')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/anthropic/v1/messages')
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('test-token')
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
    })
  })

  it('rejects missing or invalid messages', async () => {
    const noMessages = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {},
    })
    expect(noMessages.statusCode).toBe(400)

    const badRole = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'system', content: 'x' }] },
    })
    expect(badRole.statusCode).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 503 when the provider is not configured', async () => {
    delete process.env.ANTHROPIC_AUTH_TOKEN
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })
    expect(response.statusCode).toBe(503)
    expect(JSON.parse(response.body).error.code).toBe('AI_NOT_CONFIGURED')
  })

  it('returns 502 on upstream failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' })
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })
    expect(response.statusCode).toBe(502)
    expect(JSON.parse(response.body).error.code).toBe('AI_UPSTREAM_ERROR')
  })
})
