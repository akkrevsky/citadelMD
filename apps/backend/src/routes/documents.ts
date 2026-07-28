import type { FastifyInstance } from 'fastify'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { getDocumentService } from '../services/document.service.js'
import { assertFolderPermission, getDocumentFolderId } from '../services/authz.js'
import { getEffectivePermission } from '../services/folder.service.js'
import { prisma } from '../prisma.js'
import type { UserRole } from '@citadelmd/shared'

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // All document routes require authentication
  app.addHook('preHandler', authMiddleware)

  const documentService = getDocumentService()

  // ========== Document CRUD ==========

  // POST /api/folders/:folderId/documents - Create document
  app.post('/api/folders/:folderId/documents', async (request, reply) => {
    const { folderId } = request.params as { folderId: string }
    const { title, kind } = request.body as { title?: string; kind?: string }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Document title is required' },
      })
    }

    if (title.length > 200) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Document title must be 200 characters or fewer' },
      })
    }

    const docKind =
      kind === 'EXCALIDRAW' ? 'EXCALIDRAW' : kind === 'MARKDOWN' || kind === undefined ? 'MARKDOWN' : null
    if (docKind === null) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'kind must be MARKDOWN or EXCALIDRAW' },
      })
    }

    try {
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      const document = await documentService.createDocument({
        folderId,
        title: title.trim(),
        createdById: request.user!.sub,
        kind: docKind,
      })
      return reply.status(201).send(document)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'FOLDER_NOT_FOUND'
      } else if (status === 409) {
        code = 'DOCUMENT_EXISTS'
      } else {
        code = 'DOCUMENT_CREATE_ERROR'
      }
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // GET /api/documents/:id - Get document metadata
  app.get('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const document = await documentService.getDocument(id)
      if (!document) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }

      await assertFolderPermission(request.user!.sub, request.user!.role, document.folderId, 'VIEW')
      return reply.status(200).send(document)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'DOCUMENT_GET_ERROR', message: e.message },
      })
    }
  })

  // GET /api/documents/:id/export - Export document content as markdown
  app.get('/api/documents/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const document = await documentService.getDocument(id)
      if (!document) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }

      await assertFolderPermission(request.user!.sub, request.user!.role, document.folderId, 'VIEW')
      const content = await documentService.getDocumentContent(id)
      if (content === null) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_CONTENT_NOT_FOUND', message: 'Document content not found' },
        })
      }

      return reply
        .header(
          'Content-Type',
          document.kind === 'EXCALIDRAW'
            ? 'application/json; charset=utf-8'
            : 'text/markdown; charset=utf-8',
        )
        .header(
          'Content-Disposition',
          `attachment; filename="${document.title}${document.kind === 'EXCALIDRAW' ? '.excalidraw' : '.md'}"`,
        )
        .status(200)
        .send(content)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'DOCUMENT_EXPORT_ERROR', message: e.message },
      })
    }
  })

  // PATCH /api/documents/:id - Update document (title rename)
  app.patch('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { title } = request.body as { title?: string }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Document title is required' },
      })
    }

    if (title.length > 200) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Document title must be 200 characters or fewer' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      const document = await documentService.updateDocument(
        id,
        { title: title.trim() },
        request.user!.sub
      )
      return reply.status(200).send(document)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'DOCUMENT_NOT_FOUND'
      } else if (status === 409) {
        code = 'DOCUMENT_EXISTS'
      } else {
        code = 'DOCUMENT_UPDATE_ERROR'
      }
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // DELETE /api/documents/:id - Delete document
  app.delete('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'ADMIN')
      await documentService.deleteDocument(id, request.user!.sub)
      return reply.status(204).send()
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: status === 404 ? 'DOCUMENT_NOT_FOUND' : 'DOCUMENT_DELETE_ERROR', message: e.message },
      })
    }
  })

  // POST /api/documents/:id/move - Move document to another folder
  app.post('/api/documents/:id/move', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { folderId } = request.body as { folderId?: string }

    if (!folderId || typeof folderId !== 'string') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'folderId is required' },
      })
    }

    try {
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      const sourceFolderId = await getDocumentFolderId(id)
      if (!sourceFolderId) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }
      await assertFolderPermission(request.user!.sub, request.user!.role, sourceFolderId, 'EDIT')
      const document = await documentService.moveDocument(id, folderId, request.user!.sub)
      return reply.status(200).send(document)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code = 'DOCUMENT_MOVE_ERROR'
      if (status === 404) code = 'DOCUMENT_NOT_FOUND'
      else if (status === 409) code = 'DOCUMENT_EXISTS'
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // ========== Search ==========

  // GET /api/documents/search?q=<query>&folderId=<optional> — full-text search via git grep
  app.get('/api/documents/search', async (request, reply) => {
    const { q, folderId } = request.query as { q?: string; folderId?: string }

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Search query (q) is required' },
      })
    }

    if (q.length > 500) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Search query must be 500 characters or fewer' },
      })
    }

    try {
      const results = await documentService.searchDocuments(q.trim(), folderId || undefined)

      // Filter by folder permissions (admins see everything)
      const role = request.user!.role as UserRole
      const userId = request.user!.sub

      if (role === 'ADMIN') {
        return reply.status(200).send({ results })
      }

      // Batch permission checks per folder
      const folderIds = [...new Set(results.map((r) => r.folderId))]
      const permCache = new Map<string, boolean>()
      for (const fid of folderIds) {
        const perm = await getEffectivePermission(userId, fid)
        permCache.set(fid, perm !== null) // any permission (even VIEW) is enough
      }

      const filtered = results.filter((r) => permCache.get(r.folderId))
      return reply.status(200).send({ results: filtered })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'SEARCH_ERROR', message: e.message },
      })
    }
  })

  // PUT /api/documents/:id/content — overwrite working tree content (MCP)
  app.put('/api/documents/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { content, commit, message } = request.body as {
      content?: string
      commit?: boolean
      message?: string
    }

    if (typeof content !== 'string') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'content string is required' },
      })
    }

    if (content.length > 10 * 1024 * 1024) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Content exceeds 10 MB limit' },
      })
    }

    if (commit && (!message || typeof message !== 'string' || message.trim().length === 0)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Commit message is required when commit=true' },
      })
    }

    if (message && message.length > 500) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Commit message must be 500 characters or fewer' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      if (!folderId) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')

      const result = await documentService.updateDocumentContent(
        id,
        content,
        request.user!.sub,
        commit ?? false,
        message?.trim(),
      )

      return reply.status(200).send(result)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'DOCUMENT_NOT_FOUND'
      } else if (status === 409) {
        code = 'YJS_SESSION_ACTIVE'
      } else {
        code = 'UPDATE_CONTENT_ERROR'
      }
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // ========== Version Control ==========

  // POST /api/documents/:id/commit - Commit changes with message
  app.post('/api/documents/:id/commit', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { message } = request.body as { message?: string }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Commit message is required' },
      })
    }

    if (message.length > 500) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Commit message must be 500 characters or fewer' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      await documentService.commitDocument(id, message.trim(), request.user!.sub)
      const doc = await documentService.getDocument(id)
      return reply.status(200).send({
        message: 'Changes committed successfully',
        updatedAt: doc?.updatedAt,
      })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'DOCUMENT_NOT_FOUND'
      } else if (e.message.includes('No changes to commit')) {
        code = 'NO_CHANGES'
      } else if (e.message.toLowerCase().includes('locked')) {
        code = 'CONFLICT'
      } else {
        code = 'COMMIT_ERROR'
      }
      const responseStatus = status === 404 ? 404 : code === 'NO_CHANGES' ? 409 : code === 'CONFLICT' ? 409 : 500
      return reply.status(responseStatus).send({
        error: { code, message: e.message },
      })
    }
  })

  // POST /api/documents/:id/discard - Discard uncommitted changes
  app.post('/api/documents/:id/discard', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      await documentService.discardDocument(id)
      return reply.status(200).send({ message: 'Changes discarded successfully' })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'DOCUMENT_NOT_FOUND'
      } else if (e.message.toLowerCase().includes('locked')) {
        code = 'CONFLICT'
      } else {
        code = 'DISCARD_ERROR'
      }
      const responseStatus = status === 404 ? 404 : code === 'CONFLICT' ? 409 : 500
      return reply.status(responseStatus).send({
        error: { code, message: e.message },
      })
    }
  })

  // GET /api/documents/:id/diff - Get uncommitted diff
  app.get('/api/documents/:id/diff', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'VIEW')
      const diff = await documentService.getUncommittedDiff(id)
      if (diff === null) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }
      return reply.status(200).send({ diff })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'DIFF_ERROR', message: e.message },
      })
    }
  })

  // ========== Revision History ==========

  // GET /api/documents/:id/revisions - Get revision history
  app.get('/api/documents/:id/revisions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit } = request.query as { limit?: string }

    let limitNum: number | undefined
    if (limit) {
      limitNum = parseInt(limit, 10)
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Limit must be a number between 1 and 100' },
        })
      }
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'VIEW')
      const revisions = await documentService.getDocumentRevisions(id, limitNum)
      return reply.status(200).send({ revisions })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'REVISIONS_ERROR', message: e.message },
      })
    }
  })

  // GET /api/documents/:id/revisions/:sha/diff - Diff for a specific revision
  app.get('/api/documents/:id/revisions/:sha/diff', async (request, reply) => {
    const { id, sha } = request.params as { id: string; sha: string }

    if (!sha || sha.length < 7 || sha.length > 40) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Valid SHA is required (7-40 characters)' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'VIEW')
      const diff = await documentService.getRevisionDiff(id, sha)
      if (diff === null) {
        return reply.status(404).send({
          error: { code: 'REVISION_NOT_FOUND', message: 'Revision diff not found' },
        })
      }
      return reply.status(200).send({ diff })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'REVISION_DIFF_ERROR', message: e.message },
      })
    }
  })

  // GET /api/documents/:id/revisions/:sha - Get content at revision
  app.get('/api/documents/:id/revisions/:sha', async (request, reply) => {
    const { id, sha } = request.params as { id: string; sha: string }

    if (!sha || sha.length < 7 || sha.length > 40) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Valid SHA is required (7-40 characters)' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'VIEW')
      const content = await documentService.getRevisionContent(id, sha)
      if (content === null) {
        return reply.status(404).send({
          error: { code: 'REVISION_NOT_FOUND', message: 'Revision not found' },
        })
      }
      return reply.status(200).send({ content })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'REVISION_GET_ERROR', message: e.message },
      })
    }
  })

  // POST /api/documents/:id/revisions/:sha/restore - Restore to revision
  app.post('/api/documents/:id/revisions/:sha/restore', async (request, reply) => {
    const { id, sha } = request.params as { id: string; sha: string }

    if (!sha || sha.length < 7 || sha.length > 40) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Valid SHA is required (7-40 characters)' },
      })
    }

    try {
      const folderId = await getDocumentFolderId(id)
      await assertFolderPermission(request.user!.sub, request.user!.role, folderId, 'EDIT')
      await documentService.restoreToRevision(id, sha, request.user!.sub)
      return reply.status(200).send({ message: 'Document restored successfully' })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      let code: string
      if (status === 404) {
        code = 'DOCUMENT_NOT_FOUND'
      } else if (e.message.toLowerCase().includes('timeout') || e.message.toLowerCase().includes('lock')) {
        code = 'CONFLICT'
      } else {
        code = 'RESTORE_ERROR'
      }
      return reply.status(status === 404 ? 404 : code === 'CONFLICT' ? 409 : 500).send({
        error: { code, message: e.message },
      })
    }
  })

  // GET /api/documents/:id/ws-permission — effective permission for the Yjs WS
  // handshake (VIEW -> read-only, EDIT/ADMIN -> writable). Used by yjs-server to
  // authorize a connection after validating the session cookie.
  app.get('/api/documents/:id/ws-permission', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const document = await prisma.document.findUnique({
        where: { id },
        select: { filePath: true, folderId: true },
      })
      if (!document) {
        return reply.status(404).send({
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        })
      }
      const folderId = document.folderId
      if (request.user!.role === 'ADMIN') {
        return { permission: 'EDIT', filePath: document.filePath }
      }
      const perm = await getEffectivePermission(request.user!.sub, folderId)
      if (perm === null) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'No access to this document' },
        })
      }
      return {
        permission: perm === 'VIEW' ? 'VIEW' : 'EDIT',
        filePath: document.filePath,
      }
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'PERMISSION_ERROR', message: e.message },
      })
    }
  })
}