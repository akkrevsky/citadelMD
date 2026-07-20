import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildServer } from '../server.js'
import type { FastifyInstance } from 'fastify'
import * as documentServiceModule from '../services/document.service.js'
import type { DocumentMetadata, DocumentRevision } from '../services/document.service.js'

// Mock the entire document service module
vi.mock('../services/document.service.js')

const mockDocumentService = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  getDocumentContent: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  commitChanges: vi.fn(),
  discardChanges: vi.fn(),
  getUncommittedDiff: vi.fn(),
  getDocumentRevisions: vi.fn(),
  getRevisionContent: vi.fn(),
  restoreToRevision: vi.fn(),
}

// Mock the getDocumentService function
vi.mocked(documentServiceModule.getDocumentService).mockReturnValue(mockDocumentService as any)

describe('Document Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildServer()
    // Add document routes
    await app.register(require('./documents.js').documentRoutes, { prefix: '/api' })
    
    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  const mockUser = { sub: 'user-123', login: 'testuser', role: 'USER' as const }
  const mockAuthToken = 'Bearer valid-token'

  // Helper to mock auth middleware
  const mockAuthMiddleware = () => {
    app.addHook('preHandler', async (request) => {
      request.user = mockUser
    })
  }

  describe('POST /api/folders/:folderId/documents', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should create a document successfully', async () => {
      const mockDocument: DocumentMetadata = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockDocumentService.createDocument.mockResolvedValue(mockDocument)

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'Test Document' },
      })

      expect(response.statusCode).toBe(201)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
      expect(mockDocumentService.createDocument).toHaveBeenCalledWith({
        folderId: 'folder-123',
        title: 'Test Document',
        createdById: 'user-123',
      })
    })

    it('should return 400 for missing title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
      expect(body.error.message).toBe('Document title is required')
    })

    it('should return 400 for empty title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: { title: '   ' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })

    it('should return 400 for title too long', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'x'.repeat(201) },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
      expect(body.error.message).toBe('Document title must be 200 characters or fewer')
    })

    it('should return 404 for folder not found', async () => {
      const error = new Error('Folder not found')
      ;(error as any).statusCode = 404
      mockDocumentService.createDocument.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'Test Document' },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('FOLDER_NOT_FOUND')
    })

    it('should return 409 for duplicate document title', async () => {
      const error = new Error('Document with this title already exists in the folder')
      ;(error as any).statusCode = 409
      mockDocumentService.createDocument.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'Test Document' },
      })

      expect(response.statusCode).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_EXISTS')
    })
  })

  describe('GET /api/documents/:id', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should get document metadata successfully', async () => {
      const mockDocument: DocumentMetadata = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: true,
      }

      mockDocumentService.getDocument.mockResolvedValue(mockDocument)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
      expect(mockDocumentService.getDocument).toHaveBeenCalledWith('doc-123')
    })

    it('should return 404 for document not found', async () => {
      mockDocumentService.getDocument.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('GET /api/documents/:id/export', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should export document content successfully', async () => {
      const mockDocument: DocumentMetadata = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }
      const mockContent = '# Test Document\\n\\nThis is test content.'

      mockDocumentService.getDocument.mockResolvedValue(mockDocument)
      mockDocumentService.getDocumentContent.mockResolvedValue(mockContent)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/export',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8')
      expect(response.headers['content-disposition']).toBe('attachment; filename=\"Test Document.md\"')
      expect(response.body).toBe(mockContent)
    })

    it('should return 404 for document not found', async () => {
      mockDocumentService.getDocument.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/export',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })

    it('should return 404 for content not found', async () => {
      const mockDocument: DocumentMetadata = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Test Document',
        filePath: 'folder/test-document.md',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockDocumentService.getDocument.mockResolvedValue(mockDocument)
      mockDocumentService.getDocumentContent.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/export',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_CONTENT_NOT_FOUND')
    })
  })

  describe('PATCH /api/documents/:id', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should update document title successfully', async () => {
      const mockDocument: DocumentMetadata = {
        id: 'doc-123',
        folderId: 'folder-123',
        title: 'Updated Document',
        filePath: 'folder/updated-document.md',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockDocumentService.updateDocument.mockResolvedValue(mockDocument)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'Updated Document' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        'doc-123',
        { title: 'Updated Document' },
        'user-123'
      )
    })

    it('should return 400 for missing title', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })

    it('should return 409 for duplicate title', async () => {
      const error = new Error('Document with this title already exists in the folder')
      ;(error as any).statusCode = 409
      mockDocumentService.updateDocument.mockRejectedValue(error)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
        payload: { title: 'Existing Document' },
      })

      expect(response.statusCode).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_EXISTS')
    })
  })

  describe('DELETE /api/documents/:id', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should delete document successfully', async () => {
      mockDocumentService.deleteDocument.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(204)
      expect(mockDocumentService.deleteDocument).toHaveBeenCalledWith('doc-123', 'user-123')
    })

    it('should return 404 for document not found', async () => {
      const error = new Error('Document not found')
      ;(error as any).statusCode = 404
      mockDocumentService.deleteDocument.mockRejectedValue(error)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/documents/doc-123',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('POST /api/documents/:id/commit', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should commit changes successfully', async () => {
      mockDocumentService.commitChanges.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { Authorization: mockAuthToken },
        payload: { message: 'Fix typo' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.message).toBe('Changes committed successfully')
      expect(mockDocumentService.commitChanges).toHaveBeenCalledWith('doc-123', 'Fix typo', 'user-123')
    })

    it('should return 400 for missing commit message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { Authorization: mockAuthToken },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
      expect(body.error.message).toBe('Commit message is required')
    })

    it('should return 409 for no changes to commit', async () => {
      const error = new Error('No changes to commit')
      mockDocumentService.commitChanges.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { Authorization: mockAuthToken },
        payload: { message: 'Fix typo' },
      })

      expect(response.statusCode).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('NO_CHANGES')
    })

    it('should return 409 for lock timeout', async () => {
      const error = new Error('Redis lock timeout')
      mockDocumentService.commitChanges.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
        headers: { Authorization: mockAuthToken },
        payload: { message: 'Fix typo' },
      })

      expect(response.statusCode).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('CONFLICT')
    })
  })

  describe('POST /api/documents/:id/discard', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should discard changes successfully', async () => {
      mockDocumentService.discardChanges.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/discard',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.message).toBe('Changes discarded successfully')
      expect(mockDocumentService.discardChanges).toHaveBeenCalledWith('doc-123')
    })

    it('should return 404 for document not found', async () => {
      const error = new Error('Document not found')
      ;(error as any).statusCode = 404
      mockDocumentService.discardChanges.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/discard',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('GET /api/documents/:id/diff', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should get uncommitted diff successfully', async () => {
      const mockDiff = 'diff --git a/file.md b/file.md\\n+added line'
      mockDocumentService.getUncommittedDiff.mockResolvedValue(mockDiff)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/diff',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.diff).toBe(mockDiff)
      expect(mockDocumentService.getUncommittedDiff).toHaveBeenCalledWith('doc-123')
    })

    it('should return 404 for document not found', async () => {
      mockDocumentService.getUncommittedDiff.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/diff',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('GET /api/documents/:id/revisions', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should get revisions successfully', async () => {
      const mockRevisions: DocumentRevision[] = [
        {
          sha: 'abc123',
          message: 'Initial commit',
          author: { name: 'Test User', email: 'test@example.com' },
          date: new Date(),
        },
      ]
      mockDocumentService.getDocumentRevisions.mockResolvedValue(mockRevisions)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.revisions).toEqual(mockRevisions)
      expect(mockDocumentService.getDocumentRevisions).toHaveBeenCalledWith('doc-123', undefined)
    })

    it('should get revisions with limit', async () => {
      const mockRevisions: DocumentRevision[] = []
      mockDocumentService.getDocumentRevisions.mockResolvedValue(mockRevisions)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions?limit=10',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      expect(mockDocumentService.getDocumentRevisions).toHaveBeenCalledWith('doc-123', 10)
    })

    it('should return 400 for invalid limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions?limit=invalid',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })
  })

  describe('GET /api/documents/:id/revisions/:sha', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should get revision content successfully', async () => {
      const mockContent = '# Document at revision\\n\\nOld content'
      mockDocumentService.getRevisionContent.mockResolvedValue(mockContent)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.content).toBe(mockContent)
      expect(mockDocumentService.getRevisionContent).toHaveBeenCalledWith('doc-123', 'abc1234')
    })

    it('should return 400 for invalid SHA', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
      expect(body.error.message).toBe('Valid SHA is required (7-40 characters)')
    })

    it('should return 404 for revision not found', async () => {
      mockDocumentService.getRevisionContent.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions/abc1234',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('REVISION_NOT_FOUND')
    })
  })

  describe('POST /api/documents/:id/revisions/:sha/restore', () => {
    beforeEach(() => {
      mockAuthMiddleware()
    })

    it('should restore to revision successfully', async () => {
      mockDocumentService.restoreToRevision.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc1234/restore',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.message).toBe('Document restored successfully')
      expect(mockDocumentService.restoreToRevision).toHaveBeenCalledWith('doc-123', 'abc1234', 'user-123')
    })

    it('should return 400 for invalid SHA', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc/restore',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('BAD_REQUEST')
    })

    it('should return 404 for document not found', async () => {
      const error = new Error('Document not found')
      ;(error as any).statusCode = 404
      mockDocumentService.restoreToRevision.mockRejectedValue(error)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/revisions/abc1234/restore',
        headers: { Authorization: mockAuthToken },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })
})