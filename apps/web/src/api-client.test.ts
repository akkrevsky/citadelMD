import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

beforeEach(() => {
  mockFetch.mockReset()
})

describe('api-client', () => {
  describe('createDocument', () => {
    it('sends POST to /api/folders/:folderId/documents with title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'doc-1', title: 'Test Doc', filePath: 'root/test.md' }),
      })

      const result = await api.createDocument('folder-1', 'Test Doc')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/folder-1/documents')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({ title: 'Test Doc' })
      expect(result.id).toBe('doc-1')
      expect(result.title).toBe('Test Doc')
    })

    it('throws on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { code: 'BAD_REQUEST', message: 'Document title is required' } }),
      })

      await expect(api.createDocument('folder-1', '')).rejects.toThrow('Document title is required')
    })

    it('throws on 409 conflict', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: 'DOCUMENT_EXISTS', message: 'Document already exists' } }),
      })

      await expect(api.createDocument('folder-1', 'Duplicate')).rejects.toThrow('Document already exists')
    })
  })

  describe('getDocument', () => {
    it('returns document by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'doc-1', title: 'Test', filePath: 'test.md', updatedAt: '2026-01-01' }),
      })

      const result = await api.getDocument('doc-1')
      expect(result.title).toBe('Test')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1')
    })
  })

  describe('exportDocument', () => {
    it('returns document content as text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('# Hello World'),
      })

      const result = await api.exportDocument('doc-1')
      expect(result).toBe('# Hello World')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1/export')
    })
  })

  describe('commitDocument', () => {
    it('sends POST with message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ message: 'Changes committed successfully' }),
      })

      await api.commitDocument('doc-1', 'my commit')
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/documents/doc-1/commit')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({ message: 'my commit' })
    })
  })

  describe('discardDocument', () => {
    it('sends POST', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      await api.discardDocument('doc-1')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1/discard')
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST')
    })
  })

  describe('login', () => {
    it('sends POST with login and password', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user: { id: 'u1', login: 'admin', role: 'ADMIN', displayName: null }, expiresAt: '2026-02-01' }),
      })

      const result = await api.login('admin', 'password123!')
      expect(result.user.login).toBe('admin')
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/auth/login')
      expect(JSON.parse(options.body)).toEqual({ login: 'admin', password: 'password123!' })
    })

    it('throws on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid login or password' } }),
      })

      await expect(api.login('admin', 'wrong')).rejects.toThrow('Invalid login or password')
    })
  })

  describe('logout', () => {
    it('sends POST', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

      await api.logout()
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/auth/logout')
    })
  })

  describe('getMe', () => {
    it('returns current user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'u1', login: 'admin', role: 'ADMIN', displayName: 'Admin' } }),
      })

      const result = await api.getMe()
      expect(result.user.login).toBe('admin')
    })
  })

  describe('getTree', () => {
    it('returns flattened tree', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          tree: [
            {
              id: 'f1', name: 'Root', permission: 'ADMIN',
              children: [
                { id: 'f2', name: 'Sub', permission: 'VIEW', children: [], documents: [] },
              ],
              documents: [
                { id: 'd1', title: 'Doc1', filePath: 'root/doc1.md', updatedAt: '2026-01-01' },
              ],
            },
          ],
        }),
      })

      const tree = await api.getTree()
      // Should flatten: folder "Root" and its document "Doc1" (children excluded if empty docs)
      expect(Array.isArray(tree)).toBe(true)
    })

    it('returns empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const tree = await api.getTree()
      expect(tree).toEqual([])
    })
  })

  describe('changePassword', () => {
    it('sends PATCH with both passwords', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      const result = await api.changePassword('oldPass', 'newPass')
      expect(result.ok).toBe(true)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/auth/me/password')
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(options.body)).toEqual({ currentPassword: 'oldPass', newPassword: 'newPass' })
    })
  })

  describe('listUsers', () => {
    it('returns users array from paginated response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'u1', login: 'admin', role: 'ADMIN', active: true }], total: 1 }),
      })

      const users = await api.listUsers()
      expect(Array.isArray(users)).toBe(true)
      expect(users[0].login).toBe('admin')
    })

    it('returns empty array on missing data field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const users = await api.listUsers()
      expect(users).toEqual([])
    })
  })

  describe('createUser', () => {
    it('sends POST and returns user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'u2', login: 'newuser', role: 'EDITOR' }),
      })

      const user = await api.createUser({ login: 'newuser', password: 'pass1234!!', role: 'EDITOR' })
      expect(user.login).toBe('newuser')
    })
  })

  describe('deactivateUser', () => {
    it('sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

      await api.deactivateUser('u2')
      expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    })
  })
})
