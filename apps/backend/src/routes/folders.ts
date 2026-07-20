import type { FastifyInstance } from 'fastify'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import {
  createFolder,
  renameFolder,
  deleteFolder,
  getTree,
  getFolderPermissions,
  setFolderPermissions,
  getEffectivePermission,
} from '../services/folder.service.js'

export async function folderRoutes(app: FastifyInstance): Promise<void> {
  // All folder routes require authentication
  app.addHook('preHandler', authMiddleware)

  // ========== Tree ==========

  // GET /api/tree — folder tree with documents, filtered by user's permissions
  app.get('/api/tree', async (request, reply) => {
    try {
      const userId = request.user!.sub
      const userRole = request.user!.role
      const result = await getTree(userId, userRole)
      return reply.status(200).send(result)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'TREE_ERROR', message: e.message },
      })
    }
  })

  // ========== Folder CRUD ==========

  // POST /api/folders — create folder
  app.post('/api/folders', async (request, reply) => {
    const { parentId, name } = request.body as {
      parentId?: string | null
      name?: string
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Folder name is required' },
      })
    }

    if (name.length > 200) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Folder name must be 200 characters or fewer' },
      })
    }

    try {
      const folder = await createFolder({
        parentId: parentId ?? null,
        name: name.trim(),
        createdById: request.user!.sub,
      })
      return reply.status(201).send(folder)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      const code = status === 404 ? 'FOLDER_NOT_FOUND' : status === 409 ? 'FOLDER_EXISTS' : 'FOLDER_CREATE_ERROR'
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // PATCH /api/folders/:id — rename (git mv + commit)
  app.patch('/api/folders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name } = request.body as { name?: string }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Folder name is required' },
      })
    }

    if (name.length > 200) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Folder name must be 200 characters or fewer' },
      })
    }

    try {
      const folder = await renameFolder(id, { name: name.trim() }, request.user!.sub)
      return reply.status(200).send(folder)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      const code = status === 404 ? 'FOLDER_NOT_FOUND' : status === 409 ? 'FOLDER_EXISTS' : 'FOLDER_RENAME_ERROR'
      return reply.status(status).send({
        error: { code, message: e.message },
      })
    }
  })

  // DELETE /api/folders/:id — delete with cascade (git rm -r + commit)
  app.delete('/api/folders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await deleteFolder(id, request.user!.sub)
      return reply.status(204).send()
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: status === 404 ? 'FOLDER_NOT_FOUND' : 'FOLDER_DELETE_ERROR', message: e.message },
      })
    }
  })

  // ========== Permissions Management ==========

  // GET /api/folders/:id/permissions — list permissions for a folder
  app.get('/api/folders/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const permissions = await getFolderPermissions(id)
      return reply.status(200).send({ permissions })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: status === 404 ? 'FOLDER_NOT_FOUND' : 'PERMISSION_ERROR', message: e.message },
      })
    }
  })

  // PUT /api/folders/:id/permissions — set permissions for a folder
  app.put('/api/folders/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { permissions } = request.body as {
      permissions?: { userId: string; permission: string }[]
    }

    if (!Array.isArray(permissions)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'permissions array is required' },
      })
    }

    // Validate permission values
    const VALID_PERMISSIONS = ['VIEW', 'EDIT', 'ADMIN']
    for (const p of permissions) {
      if (!p.userId || !p.permission) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Each permission must have userId and permission' },
        })
      }
      if (!VALID_PERMISSIONS.includes(p.permission)) {
        return reply.status(422).send({
          error: {
            code: 'INVALID_PERMISSION',
            message: `Permission must be one of: ${VALID_PERMISSIONS.join(', ')}`,
          },
        })
      }
    }

    try {
      const result = await setFolderPermissions(
        id,
        permissions.map((p) => ({
          userId: p.userId,
          permission: p.permission as 'VIEW' | 'EDIT' | 'ADMIN',
        })),
      )
      return reply.status(200).send({ permissions: result })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      const status = e.statusCode ?? 500
      return reply.status(status).send({
        error: { code: status === 404 ? 'FOLDER_NOT_FOUND' : 'PERMISSION_ERROR', message: e.message },
      })
    }
  })

  // ========== Internal / Debug ==========

  // GET /api/folders/:id/effective-permission — debug endpoint
  app.get('/api/folders/:id/effective-permission', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const permission = await getEffectivePermission(request.user!.sub, id)
      return reply.status(200).send({
        userId: request.user!.sub,
        folderId: id,
        effectivePermission: permission,
      })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({
        error: { code: 'PERMISSION_ERROR', message: e.message },
      })
    }
  })
}
