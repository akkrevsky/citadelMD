import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth.js'

interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AiChatBody {
  messages?: AiMessage[]
}

const MAX_MESSAGES = 50
const MAX_MESSAGE_CHARS = 8000

/**
 * POST /api/ai/chat — proxy a chat to an Anthropic-compatible LLM
 * (DeepSeek). Credentials live in env (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN,
 * ANTHROPIC_MODEL) and never reach the browser.
 */
export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  app.post('/api/ai/chat', async (request, reply) => {
    const { messages } = (request.body ?? {}) as AiChatBody

    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'messages array is required' },
      })
    }
    if (messages.length > MAX_MESSAGES) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: `At most ${MAX_MESSAGES} messages allowed` },
      })
    }
    for (const m of messages) {
      if (
        !m ||
        (m.role !== 'user' && m.role !== 'assistant') ||
        typeof m.content !== 'string' ||
        m.content.length > MAX_MESSAGE_CHARS
      ) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Invalid message shape' },
        })
      }
    }

    const baseUrl = process.env.ANTHROPIC_BASE_URL
    const token = process.env.ANTHROPIC_AUTH_TOKEN
    const model = process.env.ANTHROPIC_MODEL
    if (!baseUrl || !token || !model) {
      return reply.status(503).send({
        error: { code: 'AI_NOT_CONFIGURED', message: 'AI provider is not configured' },
      })
    }

    try {
      const upstream = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': token,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '')
        request.log.error({ status: upstream.status, detail: detail.slice(0, 500) }, 'AI upstream error')
        return reply.status(502).send({
          error: { code: 'AI_UPSTREAM_ERROR', message: `AI provider returned ${upstream.status}` },
        })
      }

      const data = (await upstream.json()) as {
        content?: Array<{ type: string; text?: string }>
      }
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')

      return reply.status(200).send({ text })
    } catch (err) {
      request.log.error({ err }, 'AI request failed')
      return reply.status(502).send({
        error: { code: 'AI_UPSTREAM_ERROR', message: 'AI provider unreachable' },
      })
    }
  })
}
