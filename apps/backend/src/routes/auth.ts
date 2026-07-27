import type { FastifyInstance } from 'fastify'
import { login, buildLogoutCookie, getCookieOptions, validatePassword } from '../services/auth.service.js'
import { changePassword, updateUser } from '../services/user.service.js'
import { authMiddleware } from '../middleware/auth.js'
import { prisma } from '../prisma.js'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const { login: loginInput, password } = request.body as {
      login?: string
      password?: string
    }

    if (!loginInput || !password) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Login and password are required' },
      })
    }

    try {
      const result = await login(loginInput, password)
      reply.setCookie('token', result.token, getCookieOptions())

      return reply.status(200).send({
        user: result.user,
        expiresAt: result.expiresAt,
      })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      if (e.statusCode === 401) {
        return reply.status(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: e.message },
        })
      }
      throw err
    }
  })

  // POST /api/auth/logout → 204
  app.post('/api/auth/logout', async (_request, reply) => {
    reply.setCookie('token', '', buildLogoutCookie())
    return reply.status(204).send()
  })

  // GET /api/auth/me
  app.get(
    '/api/auth/me',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.sub
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, login: true, role: true, displayName: true, gitName: true, gitEmail: true },
      })

      if (!user) {
        return reply.status(404).send({
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        })
      }

      return { user }
    }
  )

  // PATCH /api/auth/me/password
  app.patch(
    '/api/auth/me/password',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body as {
        currentPassword?: string
        newPassword?: string
      }

      if (!currentPassword || !newPassword) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'currentPassword and newPassword are required' },
        })
      }

      try {
        await changePassword(request.user!.sub, currentPassword, newPassword)
        return reply.status(200).send({ ok: true })
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        const status = e.statusCode ?? 500
        return reply.status(status).send({
          error: { code: 'PASSWORD_ERROR', message: e.message },
        })
      }
    }
  )

  // PATCH /api/auth/me — update own git identity / display name
  app.patch(
    '/api/auth/me',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { gitName, gitEmail, displayName } = request.body as {
        gitName?: string | null
        gitEmail?: string | null
        displayName?: string | null
      }

      // Only git-identity and display name are self-editable (never role/active).
      const update: { gitName?: string | null; gitEmail?: string | null; displayName?: string | null } = {}
      let hasUpdate = false
      if (gitName !== undefined) {
        update.gitName = gitName && gitName.trim() ? gitName.trim() : null
        hasUpdate = true
      }
      if (gitEmail !== undefined) {
        const trimmed = gitEmail?.trim() ?? ''
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return reply.status(422).send({
            error: { code: 'INVALID_EMAIL', message: 'Invalid email format' },
          })
        }
        update.gitEmail = trimmed || null
        hasUpdate = true
      }
      if (displayName !== undefined) {
        update.displayName = displayName && displayName.trim() ? displayName.trim() : null
        hasUpdate = true
      }

      if (!hasUpdate) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'No updatable fields provided' },
        })
      }

      try {
        const user = await updateUser(request.user!.sub, update)
        return reply.status(200).send({ user })
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({
          error: { code: 'PROFILE_UPDATE_ERROR', message: e.message },
        })
      }
    }
  )
}
