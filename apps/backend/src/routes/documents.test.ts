import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { UserRole } from '@citadelmd/shared'

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
})