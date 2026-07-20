import type { FastifyInstance } from 'fastify'
import type { UserRole } from '@citadelmd/shared'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
} from '../services/user.service.js'

const VALID_ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // All user routes require auth + ADMIN role
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requireRole('ADMIN'))

  // GET /api/users
  app.get('/api/users', async () => {
    return listUsers()
  })

  // POST /api/users
  app.post('/api/users', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const login_ = body.login as string
    const password = body.password as string
    const role = body.role as string
    const displayName = body.displayName as string | undefined
    const gitName = body.gitName as string | undefined
    const gitEmail = body.gitEmail as string | undefined

    if (!login_ || !password || !role) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'login, password, and role are required' },
      })
    }

    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return reply.status(422).send({
        error: { code: 'INVALID_ROLE', message: `Role must be one of: ${VALID_ROLES.join(', ')}` },
      })
    }

    try {
      const user = await createUser({
        login: login_,
        password,
        role: role as UserRole,
        displayName,
        gitName,
        gitEmail,
      })
      return reply.status(201).send(user)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: status === 409 ? 'LOGIN_TAKEN' : 'USER_CREATE_ERROR', message: e.message },
      })
    }
  })

  // GET /api/users/:id
  app.get('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await getUserById(id)
    if (!user) {
      return reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }
    return user
  })

  // PATCH /api/users/:id
  app.patch('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>

    try {
      const user = await updateUser(id, {
        role: body.role as UserRole | undefined,
        displayName: body.displayName as string | undefined | null,
        active: body.active as boolean | undefined,
        password: body.password as string | undefined,
        gitName: body.gitName as string | undefined | null,
        gitEmail: body.gitEmail as string | undefined | null,
        regenerateApiKey: body.regenerateApiKey as boolean | undefined,
      })
      return reply.status(200).send(user)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: 'USER_UPDATE_ERROR', message: e.message },
      })
    }
  })

  // DELETE /api/users/:id (deactivates)
  app.delete('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deactivateUser(id)
      return reply.status(204).send()
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: 'USER_DELETE_ERROR', message: e.message },
      })
    }
  })
}
