import { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { prisma } from '../prisma.js'
import { verifyAuth } from '../middleware/auth.js'

const DEFAULT_TTL_HOURS = 24
const MAX_TTL_HOURS = 720 // 30 days

// POST /api/documents/:documentId/shares — create share link
// GET /api/documents/:documentId/shares — list shares for document
// GET /api/shares/:token — resolve share (public, no auth required)
// DELETE /api/shares/:id — delete/revoke share

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // Create share link
  app.post('/api/documents/:documentId/shares', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.sub
    const { documentId } = request.params as any
    const { permission, ttlHours } = request.body as any

    const perm = permission === 'WRITE' ? 'WRITE' : 'READ'
    const ttl = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 1), MAX_TTL_HOURS)

    // Verify document exists
    const document = await prisma.document.findUnique({ where: { id: documentId } })
    if (!document) {
      reply.code(404)
      return { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } }
    }

    const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000)
    const token = randomBytes(24).toString('base64url')

    const share = await prisma.share.create({
      data: {
        documentId,
        token,
        permission: perm as any,
        expiresAt,
        createdById: userId,
      },
    })

    reply.code(201)
    return {
      share: {
        id: share.id,
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt,
        url: `/share/${share.token}`,
      },
    }
  })

  // List shares for document
  app.get('/api/documents/:documentId/shares', { preHandler: [verifyAuth] }, async (request) => {
    const { documentId } = request.params as any
    const shares = await prisma.share.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, token: true, permission: true, expiresAt: true, createdAt: true,
        createdBy: { select: { login: true, displayName: true } },
      },
    })
    return { shares }
  })

  // Resolve share token (public — no auth)
  app.get('/api/shares/:token', async (request, reply) => {
    const { token } = request.params as any
    const share = await prisma.share.findUnique({
      where: { token },
      include: {
        document: { select: { id: true, title: true } },
      },
    })

    if (!share) {
      reply.code(404)
      return { error: { code: 'SHARE_NOT_FOUND', message: 'Share link not found' } }
    }

    if (share.expiresAt < new Date()) {
      reply.code(410)
      return { error: { code: 'SHARE_EXPIRED', message: 'Share link has expired' } }
    }

    return {
      share: {
        token: share.token,
        permission: share.permission,
        document: share.document,
        expiresAt: share.expiresAt,
      },
    }
  })

  // Revoke share
  app.delete('/api/shares/:id', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as any
    const share = await prisma.share.findUnique({ where: { id } })

    if (!share) {
      reply.code(404)
      return { error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } }
    }

    await prisma.share.delete({ where: { id } })
    reply.code(204)
  })
}
