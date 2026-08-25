import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api-client'

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
      expect(JSON.parse(options.body)).toEqual({ title: 'Test Doc', kind: 'MARKDOWN' })
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

    it('sets Content-Type: application/json when sending a body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user: { id: 'u1', login: 'admin', role: 'ADMIN', displayName: null }, expiresAt: '2026-02-01' }),
      })

      await api.login('admin', 'password123!')
      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers?.['Content-Type']).toBe('application/json')
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

    it('does not set Content-Type: application/json (no body)', async () => {
      // Regression: sending Content-Type: application/json with an empty body
      // makes Fastify reject the request with 400
      // "Body cannot be empty when content-type is set to 'application/json'".
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

      await api.logout()
      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers?.['Content-Type']).toBeUndefined()
      expect(headers?.['content-type']).toBeUndefined()
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
              id: 'f1', name: 'Root', permission: 'ADMIN', parentId: null, gitPath: '',
              children: [
                { id: 'f2', name: 'Sub', permission: 'VIEW', parentId: 'f1', gitPath: 'sub',
                  children: [], documents: [] },
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
      const root = tree.find((i) => i.type === 'folder' && i.name === 'Root')
      expect(root?.parentId).toBeNull()
      expect(root?.folderGitPath).toBe('')
      const doc = root?.children?.find((i) => i.type === 'document')
      expect(doc?.parentId).toBe('f1')
    })

    it('returns empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const tree = await api.getTree()
      expect(tree).toEqual([])
    })
  })

  describe('renameFolder', () => {
    it('sends PATCH to /api/folders/:id with name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'f1', name: 'New', mode: 'GIT' }),
      })

      const result = await api.renameFolder('f1', { name: 'New' })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/f1')
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(options.body)).toEqual({ name: 'New' })
      expect(result.name).toBe('New')
    })

    it('throws on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: 'FOLDER_EXISTS', message: 'Folder with this name already exists' } }),
      })

      await expect(api.renameFolder('f1', { name: 'New' })).rejects.toThrow(
        'Folder with this name already exists',
      )
    })
  })

  describe('deleteFolder', () => {
    it('sends DELETE to /api/folders/:id without a body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

      await api.deleteFolder('f1')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/f1')
      expect(options.method).toBe('DELETE')
      expect(options.body).toBeUndefined()
      // Empty body must not set Content-Type (Fastify rejects such requests)
      expect((options.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined()
    })

    it('throws on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: 'FOLDER_NOT_FOUND', message: 'Folder not found' } }),
      })

      await expect(api.deleteFolder('missing')).rejects.toThrow('Folder not found')
    })
  })

  describe('getFolderPermissions', () => {
    it('sends GET and unwraps the permissions array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            permissions: [{ userId: 'u2', login: 'alice', permission: 'VIEW' }],
          }),
      })

      const result = await api.getFolderPermissions('f1')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/f1/permissions')
      expect(options.method ?? 'GET').toBe('GET')
      expect(result).toEqual([{ userId: 'u2', login: 'alice', permission: 'VIEW' }])
    })
  })

  describe('setFolderPermissions', () => {
    it('sends PUT with the permissions array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ permissions: [] }),
      })

      await api.setFolderPermissions('f1', [{ userId: 'u2', permission: 'EDIT' }])
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/f1/permissions')
      expect(options.method).toBe('PUT')
      expect(JSON.parse(options.body)).toEqual({
        permissions: [{ userId: 'u2', permission: 'EDIT' }],
      })
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

  describe('updateProfile', () => {
    it('sends PATCH to /api/auth/me with git identity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'u1', login: 'admin', role: 'ADMIN', displayName: null, gitName: 'Admin', gitEmail: 'a@b.c' },
          }),
      })

      const result = await api.updateProfile({ gitName: 'Admin', gitEmail: 'a@b.c' })
      expect(result.user.gitName).toBe('Admin')
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/auth/me')
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(options.body)).toEqual({ gitName: 'Admin', gitEmail: 'a@b.c' })
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

  describe('revision history methods', () => {
    it('getRevisions fetches the revision list', async () => {
      const revisions = [{ sha: 'abc1234', message: 'Second commit' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ revisions }),
      })

      const result = await api.getRevisions('doc-1')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1/revisions')
      expect(result.revisions).toEqual(revisions)
    })

    it('getRevisions appends limit query param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ revisions: [] }),
      })

      await api.getRevisions('doc-1', 5)
      expect(mockFetch.mock.calls[0][0]).toContain('/revisions?limit=5')
    })

    it('getRevisionContent returns the content string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ content: '# Old' }),
      })

      const content = await api.getRevisionContent('doc-1', 'abc1234')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1/revisions/abc1234')
      expect(content).toBe('# Old')
    })

    it('getRevisionDiff returns the diff string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ diff: '+line' }),
      })

      const diff = await api.getRevisionDiff('doc-1', 'abc1234')
      expect(mockFetch.mock.calls[0][0]).toContain('/revisions/abc1234/diff')
      expect(diff).toBe('+line')
    })

    it('restoreToRevision posts to the restore endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })

      await api.restoreToRevision('doc-1', 'abc1234')
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/documents/doc-1/revisions/abc1234/restore')
      expect(options.method).toBe('POST')
    })

    it('getDiff fetches the uncommitted diff', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ diff: '-removed' }),
      })

      const res = await api.getDiff('doc-1')
      expect(mockFetch.mock.calls[0][0]).toContain('/api/documents/doc-1/diff')
      expect(res.diff).toBe('-removed')
    })
  })
  describe('importDocument', () => {
    it('sends POST with FormData and no Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'doc-9', title: 'notes', filePath: 'root/notes.md' }),
      })

      await api.importDocument('folder-1', new File(['# Hi'], 'notes.md', { type: 'text/markdown' }))

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/folders/folder-1/import')
      expect(options.method).toBe('POST')
      expect(options.body).toBeInstanceOf(FormData)
      const headers = options.headers as Record<string, string> | undefined
      expect(headers?.['Content-Type']).toBeUndefined()
    })

    it('throws the server message on conflict', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: 'DOCUMENT_EXISTS', message: 'Document already exists' } }),
      })

      await expect(
        api.importDocument('folder-1', new File(['# Hi'], 'notes.md')),
      ).rejects.toThrow('Document already exists')
    })
  })

  describe('aiChat', () => {
    it('sends messages to the ai endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ text: 'Hi' }),
      })

      const result = await api.aiChat([{ role: 'user', content: 'hello' }])
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/ai/chat')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body as string)).toEqual({
        messages: [{ role: 'user', content: 'hello' }],
      })
      expect(result.text).toBe('Hi')
    })

    it('throws upstream errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: { code: 'AI_UPSTREAM_ERROR', message: 'AI provider returned 401' } }),
      })

      await expect(api.aiChat([{ role: 'user', content: 'x' }])).rejects.toThrow(
        'AI provider returned 401',
      )
    })
  })

  describe('resolveDocumentPath', () => {
    it('encodes the path into the by-path query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'doc-1', title: 'Note', kind: 'MARKDOWN' }),
      })

      const result = await api.resolveDocumentPath('folder/note.md')
      expect(mockFetch.mock.calls[0][0]).toContain(
        `/api/documents/by-path?path=${encodeURIComponent('folder/note.md')}`,
      )
      expect(result.id).toBe('doc-1')
    })

    it('throws the server message on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } }),
      })

      await expect(api.resolveDocumentPath('folder/missing.md')).rejects.toThrow(
        'Document not found',
      )
    })
  })

})
