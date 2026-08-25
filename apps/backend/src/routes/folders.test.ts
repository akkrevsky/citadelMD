import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { assertFolderPermission } from '../services/authz.js'

const mockFolderService = {
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  getTree: vi.fn(),
  getFolderPermissions: vi.fn(),
  setFolderPermissions: vi.fn(),
  getEffectivePermission: vi.fn(),
  updateFolderSettings: vi.fn(),
  ensurePersonalFolder: vi.fn(),
}

vi.mock('../services/folder.service.js', () => mockFolderService)

vi.mock('../services/authz.js', () => ({
  assertFolderPermission: vi.fn().mockResolvedValue(undefined),
}))
const mockAssertFolderPermission = vi.mocked(assertFolderPermission)

vi.mock('../services/auth.service.js', () => ({
  verifyToken: vi.fn().mockReturnValue({
    sub: 'user-123',
    login: 'testuser',
    role: 'VIEWER',
  }),
}))

describe('Folder Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    const { folderRoutes } = await import('./folders.js')
    await app.register(folderRoutes)

    for (const mock of Object.values(mockFolderService)) mock.mockReset()
    mockAssertFolderPermission.mockReset()
    mockAssertFolderPermission.mockResolvedValue(undefined)
    mockFolderService.ensurePersonalFolder.mockResolvedValue({
      id: 'root-1',
      gitPath: 'users/testuser',
    })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/folders', () => {
    it('defaults the parent to the personal root', async () => {
      mockFolderService.createFolder.mockResolvedValue({ id: 'f1', name: 'Notes' })

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders',
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Notes' },
      })

      expect(response.statusCode).toBe(201)
      expect(mockFolderService.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'root-1', name: 'Notes' }),
      )
    })

    it('rejects a foreign parentId for non-admins with 403', async () => {
      mockAssertFolderPermission.mockRejectedValue(
        Object.assign(new Error('Insufficient folder permission'), { statusCode: 403 }),
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders',
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Hack', parentId: 'someone-elses-root' },
      })

      expect(response.statusCode).toBe(403)
      expect(mockFolderService.createFolder).not.toHaveBeenCalled()
    })
  })

  describe('folder mutation permission gates', () => {
    it('PATCH rename requires EDIT', async () => {
      mockFolderService.renameFolder.mockResolvedValue({ id: 'f1', name: 'New' })

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/folders/f1',
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New' },
      })

      expect(response.statusCode).toBe(200)
      expect(mockAssertFolderPermission).toHaveBeenCalledWith(
        'user-123',
        'VIEWER',
        'f1',
        'EDIT',
      )
    })

    it('DELETE requires ADMIN', async () => {
      mockFolderService.deleteFolder.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/folders/f1',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(204)
      expect(mockAssertFolderPermission).toHaveBeenCalledWith(
        'user-123',
        'VIEWER',
        'f1',
        'ADMIN',
      )
    })

    it('PATCH settings requires ADMIN', async () => {
      mockFolderService.updateFolderSettings.mockResolvedValue({ id: 'f1', mode: 'SNAPSHOT' })

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/folders/f1/settings',
        headers: { authorization: 'Bearer test-token' },
        payload: { mode: 'SNAPSHOT' },
      })

      expect(response.statusCode).toBe(200)
      expect(mockAssertFolderPermission).toHaveBeenCalledWith(
        'user-123',
        'VIEWER',
        'f1',
        'ADMIN',
      )
    })

    it('GET permissions requires ADMIN', async () => {
      mockFolderService.getFolderPermissions.mockResolvedValue([])

      const response = await app.inject({
        method: 'GET',
        url: '/api/folders/f1/permissions',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(mockAssertFolderPermission).toHaveBeenCalledWith(
        'user-123',
        'VIEWER',
        'f1',
        'ADMIN',
      )
    })

    it('PUT permissions requires ADMIN', async () => {
      mockFolderService.setFolderPermissions.mockResolvedValue([])

      const response = await app.inject({
        method: 'PUT',
        url: '/api/folders/f1/permissions',
        headers: { authorization: 'Bearer test-token' },
        payload: { permissions: [{ userId: 'u2', permission: 'VIEW' }] },
      })

      expect(response.statusCode).toBe(200)
      expect(mockAssertFolderPermission).toHaveBeenCalledWith(
        'user-123',
        'VIEWER',
        'f1',
        'ADMIN',
      )
    })

    it('returns 403 when the permission check fails', async () => {
      mockAssertFolderPermission.mockRejectedValue(
        Object.assign(new Error('Insufficient folder permission'), { statusCode: 403 }),
      )

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/folders/f1',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(403)
      expect(mockFolderService.deleteFolder).not.toHaveBeenCalled()
    })
  })
})
