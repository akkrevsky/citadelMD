import { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { verifyAuth, requireRole } from '../middleware/auth.js'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/users — list users with quota info
  app.get('/api/admin/users', { preHandler: [verifyAuth, requireRole('ADMIN')] }, async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        login: true,
        displayName: true,
        role: true,
        active: true,
        quota: true,
      },
    })
    return { users }
  })

  // PUT /api/admin/users/:userId/quota — set user quota
  app.put('/api/admin/users/:userId/quota', { preHandler: [verifyAuth, requireRole('ADMIN')] }, async (request, reply) => {
    const { userId } = request.params as any
    const { maxStorageBytes } = request.body as any
    if (!maxStorageBytes || maxStorageBytes < 0) {
      reply.code(400)
      return { error: { code: 'INVALID_QUOTA', message: 'maxStorageBytes must be a positive number' } }
    }
    const quota = await prisma.userQuota.upsert({
      where: { userId },
      create: { userId, maxStorageBytes, usedStorageBytes: 0 },
      update: { maxStorageBytes },
    })
    return { quota }
  })
}
