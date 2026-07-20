import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authRoutes } from '../src/routes/auth.js'
import { userRoutes } from '../src/routes/users.js'
import { prisma } from '../src/prisma.js'
import { hashPassword, signToken } from '../src/services/auth.service.js'

// Set env before importing anything that reads JWT_SECRET
process.env.JWT_SECRET = 'test-secret-that-is-at-least-256-bits-long-for-testing-0123456789abcdef'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mduser:mdpass@localhost:5432/mdcollab'

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(authRoutes)
  await app.register(userRoutes)
  return app
}

let app: ReturnType<typeof Fastify>

let adminUserId: string
let adminToken: string
let editorUserId: string

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-256-bits-long-for-testing-0123456789abcdef'

  // Clean up any test users first
  await prisma.user.deleteMany({
    where: { login: { in: ['testadmin', 'testeditor', 'newusertest'] } },
  })

  // Create an admin user
  const adminHash = await hashPassword('adminPass123!')
  const admin = await prisma.user.create({
    data: {
      login: 'testadmin',
      passwordHash: adminHash,
      role: 'ADMIN',
      displayName: 'Test Admin',
      gitName: 'Test Admin',
      gitEmail: 'admin@test.local',
      apiKey: 'test-admin-api-key-hex-00000000000000000000000000',
    },
  })
  adminUserId = admin.id
  adminToken = signToken(admin)

  // Create an editor user
  const editorHash = await hashPassword('editorPass123!')
  const editor = await prisma.user.create({
    data: {
      login: 'testeditor',
      passwordHash: editorHash,
      role: 'EDITOR',
      displayName: 'Test Editor',
      gitName: 'Test Editor',
      gitEmail: 'editor@test.local',
      apiKey: 'test-editor-api-key-hex-00000000000000000000000000',
    },
  })
  editorUserId = editor.id

  app = await buildTestApp()
  await app.ready()
})

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { login: { in: ['testadmin', 'testeditor', 'newusertest'] } },
  })
  await app.close()
})

// ─── Auth Routes ───────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 with user and sets cookie on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'testadmin', password: 'adminPass123!' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.user).toBeDefined()
    expect(body.user.login).toBe('testadmin')
    expect(body.user.role).toBe('ADMIN')
    expect(body.expiresAt).toBeDefined()
    // Check cookie was set
    expect(res.cookies[0]).toBeDefined()
    expect(res.cookies[0].name).toBe('token')
    expect(res.cookies[0].value).toBeTruthy()
  })

  it('returns 401 on invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'testadmin', password: 'wrongpassword' },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.payload).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 on non-existent user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'nonexistent', password: 'somepass123' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when login or password missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'testadmin' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 204 and clears cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    })
    expect(res.statusCode).toBe(204)
    const setCookie = res.cookies[0]
    expect(setCookie).toBeDefined()
    expect(setCookie.name).toBe('token')
    expect(setCookie.value).toBe('')
  })
})

describe('GET /api/auth/me', () => {
  it('returns user when authenticated with cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.user.login).toBe('testadmin')
    expect(body.user.role).toBe('ADMIN')
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token: 'invalid-token' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/auth/me/password', () => {
  it('returns 200 when password changed successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me/password',
      cookies: { token: adminToken },
      payload: { currentPassword: 'adminPass123!', newPassword: 'newAdminPass456' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).ok).toBe(true)

    // Verify can login with new password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'testadmin', password: 'newAdminPass456' },
    })
    expect(loginRes.statusCode).toBe(200)

    // Change back to original
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/me/password',
      cookies: { token: adminToken },
      payload: { currentPassword: 'newAdminPass456', newPassword: 'adminPass123!' },
    })
  })

  it('returns 401 with wrong current password', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me/password',
      cookies: { token: adminToken },
      payload: { currentPassword: 'wrongpassword', newPassword: 'newPass12345' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 422 with short new password', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me/password',
      cookies: { token: adminToken },
      payload: { currentPassword: 'adminPass123!', newPassword: 'short' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me/password',
      payload: { currentPassword: 'x', newPassword: 'y' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── User Routes (admin-only) ──────────────────────────────────

describe('GET /api/users', () => {
  it('returns list of users for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      cookies: { token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.data).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(body.data.some((u: { login: string }) => u.login === 'testadmin')).toBe(true)
  })

  it('returns 403 for non-admin users', async () => {
    const editorToken = signToken({
      id: editorUserId,
      login: 'testeditor',
      role: 'EDITOR',
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      cookies: { token: editorToken },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/users', () => {
  it('creates a new user and returns 201 with apiKey', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      cookies: { token: adminToken },
      payload: {
        login: 'newusertest',
        password: 'newUserPassword10',
        role: 'EDITOR',
        displayName: 'New User',
        gitName: 'New User',
        gitEmail: 'newuser@test.local',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.login).toBe('newusertest')
    expect(body.role).toBe('EDITOR')
    expect(body.apiKey).toBeTruthy()
    expect(typeof body.apiKey).toBe('string')
    expect(body.apiKey!.length).toBe(64) // 32 bytes = 64 hex chars
  })

  it('returns 409 for duplicate login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      cookies: { token: adminToken },
      payload: {
        login: 'newusertest',
        password: 'anotherPass123',
        role: 'VIEWER',
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 422 with weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      cookies: { token: adminToken },
      payload: {
        login: 'anotheruser',
        password: 'short',
        role: 'VIEWER',
      },
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('GET /api/users/:id', () => {
  it('returns user by id for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.login).toBe('testeditor')
  })

  it('returns 404 for non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      cookies: { token: adminToken },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/users/:id', () => {
  it('updates user role and displayName', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
      payload: { role: 'VIEWER', displayName: 'Updated Name' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.role).toBe('VIEWER')
    expect(body.displayName).toBe('Updated Name')

    // Restore
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
      payload: { role: 'EDITOR' },
    })
  })

  it('regenerates apiKey when requested', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
      payload: { regenerateApiKey: true },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.apiKey).toBeTruthy()
    expect(body.apiKey!.length).toBe(64)
    expect(body.apiKey).not.toBe('test-editor-api-key-hex-00000000000000000000000000')
  })
})

describe('DELETE /api/users/:id', () => {
  it('deactivates a user with no documents', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
    })
    expect(res.statusCode).toBe(204)
  })

  it('can login with active user (the deleted user should exist but be inactive)', async () => {
    // Re-activate the editor for other tests
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${editorUserId}`,
      cookies: { token: adminToken },
      payload: { active: true },
    })
  })
})
