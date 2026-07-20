import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserRole } from '@citadelmd/shared'
import { verifyToken, type JwtPayload } from '../services/auth.service.js'

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try cookie first, then Authorization header
  let token: string | undefined

  if (request.cookies?.token) {
    token = request.cookies.token
  } else {
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (authHeader?.startsWith('ApiKey ')) {
      // API key auth: handle separately via apiKeyMiddleware
      // For now, skip token verification — apiKeyMiddleware will catch it
      return
    }
  }

  if (!token) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    })
    return
  }

  try {
    const payload = verifyToken(token)
    request.user = payload
  } catch {
    reply.status(401).send({
      error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' },
    })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.user
    if (!user) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      })
      return
    }
    if (!roles.includes(user.role)) {
      reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      })
    }
  }
}

export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('ApiKey ')) return // Not API key auth, skip

  const apiKey = authHeader.slice(7)
  if (!apiKey) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'API key required' },
    })
    return
  }

  const { prisma } = await import('../prisma.js')
  const user = await prisma.user.findUnique({
    where: { apiKey },
    select: { id: true, login: true, role: true, active: true },
  })

  if (!user || !user.active) {
    reply.status(401).send({
      error: { code: 'INVALID_API_KEY', message: 'Invalid or inactive API key' },
    })
    return
  }

  request.user = {
    sub: user.id,
    login: user.login,
    role: user.role as UserRole,
  }
}
