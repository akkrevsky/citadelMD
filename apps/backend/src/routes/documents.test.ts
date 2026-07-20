import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { UserRole } from '@citadelmd/shared'

// Mock the document service 
vi.mock('../services/document.service.js', () => ({
  getDocumentService: () => ({
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
  })
}))

describe('Document Routes', () => {
  let app: FastifyInstance
  let mockService: any

  beforeEach(async () => {
    // Get the mocked service
    const { getDocumentService } = await import('../services/document.service.js')
    mockService = getDocumentService()
    
    // Create fresh app
    app = Fastify({ logger: false })
    
    // Mock auth middleware
    app.addHook('preHandler', async (request) => {
      ;(request as any).user = { 
        sub: 'user-123', 
        login: 'testuser', 
        role: 'VIEWER' as UserRole 
      }
    })
    
    // Register document routes
    const { documentRoutes } = await import('./documents.js')
    await app.register(documentRoutes, { prefix: '/api' })
    
    // Reset all mocks
    Object.values(mockService).forEach((mock: any) => mock.mockReset())
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
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockService.createDocument.mockResolvedValue(mockDocument)

      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
        payload: { title: 'Test Document' },
      })

      expect(response.statusCode).toBe(201)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
    })

    it('should return 400 for missing title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/folders/folder-123/documents',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-123',
        hasUncommittedChanges: false,
      }

      mockService.getDocument.mockResolvedValue(mockDocument)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual(mockDocument)
    })

    it('should return 404 for document not found', async () => {
      mockService.getDocument.mockResolvedValue(null)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123',
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('DOCUMENT_NOT_FOUND')
    })
  })

  describe('POST /api/documents/:id/commit', () => {
    it('should commit changes successfully', async () => {
      mockService.commitChanges.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/doc-123/commit',
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

      mockService.getDocumentRevisions.mockResolvedValue(mockRevisions)

      const response = await app.inject({
        method: 'GET',
        url: '/api/documents/doc-123/revisions',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.revisions).toEqual(mockRevisions)
    })
  })

  describe('DELETE /api/documents/:id', () => {
    it('should delete document successfully', async () => {
      mockService.deleteDocument.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/documents/doc-123',
      })

      expect(response.statusCode).toBe(204)
    })
  })
})