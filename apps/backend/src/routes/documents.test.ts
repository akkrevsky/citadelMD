import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { UserRole } from '@citadelmd/shared'
import { assertFolderPermission } from '../services/authz.js'

// Mock the document service 
const mockDocumentService = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  getDocumentContent: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  commitChanges: vi.fn(),
  commitDocument: vi.fn(),
  discardChanges: vi.fn(),
  discardDocument: vi.fn(),
  getUncommittedDiff: vi.fn(),
  getDocumentRevisions: vi.fn(),
  getRevisionContent: vi.fn(),
  getRevisionDiff: vi.fn(),
  restoreToRevision: vi.fn(),
}

vi.mock('../services/document.service.js', () => ({
  getDocumentService: () => mockDocumentService
}))

// The route enforces folder permissions via the authz layer; mock it so these
// route tests (which mock the document service) do not require a database.
vi.mock('../services/authz.js', () => ({
  assertFolderPermission: vi.fn().mockResolvedValue(undefined),
  getDocumentFolderId: vi.fn().mockResolvedValue('folder-test'),
}))
const mockAssertFolderPermission = vi.mocked(assertFolderPermission)

// Mock the auth service to return a valid token
vi.mock('../services/auth.service.js', () => ({
  verifyToken: vi.fn().mockReturnValue({
    sub: 'user-123',
    login: 'testuser',
    role: 'VIEWER'
  })
}))

describe('Document Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // Create fresh app
    app = Fastify({ logger: false })
    
    // Register document routes
    const { documentRoutes } = await import('./documents.js')
    await app.register(documentRoutes)
    
    // Reset all mocks
    Object.values(mockDocumentService).forEach((mock: any) => mock.mockReset())
    mockAssertFolderPermission.mockReset()
    mockAssertFolderPermission.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/folders/:folderId/documents', () => {
    it('should create a document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: '2026-07-20T09:58:20.373Z',
        updatedAt: '2026-07-20T09:58:20.373Z',
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      // Mock returns Date objects but JSON serialization converts to strings
      mockDocumentService.createDocument.mockResolvedValue({
        ...mockDocument,
        createdAt: new Date(mockDocument.createdAt),
        updatedAt: new Date(mockDocument.updatedAt),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { authorization: 'Bearer test-token' },
        payload: { title: 'Test Document' },
      })

      expect(response.statusCode).toBe(201)
      if (response.body) {
        expect(JSON.parse(response.body)).toEqual(mockDocument)
      }
    })

    it('should return 400 for missing title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })
  })

  describe('GET /api/documents/:id', () => {
    it('should get document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: '2026-07-20T09:58:20.397Z',
        updatedAt: '2026-07-20T09:58:20.397Z',
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockDocumentService.getDocument.mockResolvedValue({
        ...mockDocument,
        createdAt: new Date(mockDocument.createdAt),
        updatedAt: new Date(mockDocument.updatedAt),
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
    })

    it('should return 404 for document not found', async () => {
      mockDocumentService.getDocument.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('POST /api/documents/:id/commit', () => {
    it('should commit changes successfully', async () => {
      mockDocumentService.commitDocument.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { authorization: 'Bearer test-token' },
        payload: { message: 'Fix typo' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.message).toBe('Changes committed successfully')
    })

    it('should return 400 for missing message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })
  })

  describe('GET /api/documents/:id/revisions', () => {
    it('should get revisions successfully', async () => {
      const mockRevisions = [
        {
          sha: 'abc123',
          message: 'Initial commit',
          authorName: 'Test User',
          authorEmail: 'test@example.com',
          date: '2024-01-01T00:00:00Z',
        },
      ]

      mockDocumentService.getDocumentRevisions.mockResolvedValue(mockRevisions)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.revisions).toEqual(mockRevisions)
    })

    it('should pass limit query param to the service', async () => {
      mockDocumentService.getDocumentRevisions.mockResolvedValue([])

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions?limit=5',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(mockDocumentService.getDocumentRevisions).toHaveBeenCalledWith('doc-123', 5)
    })

    it('should reject invalid limit values', async () => {
      for (const limit of ['0', '-1', 'abc', '101']) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/documents/doc-123/revisions?limit=${limit}`,
          headers: { authorization: 'Bearer test-token' },
        })

        expect(response.statusCode).toBe(400)
        expect(JSON.parse(response.body).error.code).toBe('BAD_REQUEST')
        expect(mockDocumentService.getDocumentRevisions).not.toHaveBeenCalled()
      }
    })
  })

  describe('GET /api/documents/:id/revisions/:sha', () => {
    it('should return content at revision', async () => {
      mockDocumentService.getRevisionContent.mockResolvedValue('# Old content')

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).content).toBe('# Old content')
      expect(mockDocumentService.getRevisionContent).toHaveBeenCalledWith('doc-123', 'abc1234')
    })

    it('should return 404 when revision does not exist', async () => {
      mockDocumentService.getRevisionContent.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.body).error.code).toBe('REVISION_NOT_FOUND')
    })

    it('should reject invalid SHA', async () => {
      for (const sha of ['', 'abc', 'x'.repeat(41)]) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/documents/doc-123/revisions/${sha}`,
          headers: { authorization: 'Bearer test-token' },
        })

        expect(response.statusCode).toBe(400)
        expect(JSON.parse(response.body).error.code).toBe('BAD_REQUEST')
        expect(mockDocumentService.getRevisionContent).not.toHaveBeenCalled()
      }
    })
  })

  describe('GET /api/documents/:id/revisions/:sha/diff', () => {
    it('should return revision diff', async () => {
      mockDocumentService.getRevisionDiff.mockResolvedValue('+added line')

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234/diff',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).diff).toBe('+added line')
      expect(mockDocumentService.getRevisionDiff).toHaveBeenCalledWith('doc-123', 'abc1234')
    })

    it('should return 404 when diff does not exist', async () => {
      mockDocumentService.getRevisionDiff.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234/diff',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.body).error.code).toBe('REVISION_NOT_FOUND')
    })

    it('should reject invalid SHA', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc/diff',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(400)
      expect(mockDocumentService.getRevisionDiff).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/documents/:id/revisions/:sha/restore', () => {
    it('should restore to revision', async () => {
      mockDocumentService.restoreToRevision.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc1234/restore',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).message).toContain('restored')
      expect(mockDocumentService.restoreToRevision).toHaveBeenCalledWith('doc-123', 'abc1234', 'user-123')
    })

    it('should return 404 when document not found', async () => {
      mockDocumentService.restoreToRevision.mockRejectedValue(
        Object.assign(new Error('Document not found'), { statusCode: 404 }),
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc1234/restore',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.body).error.code).toBe('DOCUMENT_NOT_FOUND')
    })

    it('should reject invalid SHA', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc/restore',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(400)
      expect(mockDocumentService.restoreToRevision).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/documents/:id', () => {
    it('should delete document successfully', async () => {
      mockDocumentService.deleteDocument.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/documents/doc-123',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(204)
    })
  })

  describe('permission enforcement', () => {
    it('returns 403 when assertFolderPermission denies access', async () => {
      mockDocumentService.getDocument.mockResolvedValue({ id: 'doc-123', folderId: 'folder-1' })
      mockAssertFolderPermission.mockRejectedValueOnce(
        Object.assign(new Error('Insufficient folder permission'), { statusCode: 403 }),
      )

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})