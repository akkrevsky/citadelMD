import { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { prisma } from '../prisma.js'
import { getMinioClient } from '../services/minio.service.js'
import { verifyAuth } from '../middleware/auth.js'
import { assertFolderPermission } from '../services/authz.js'
import { randomUUID } from 'crypto'
import { extname } from 'path'

const MIME_ALLOWLIST = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/markdown',
]

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'md-collab-uploads'

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
    },
  })

  app.post('/api/uploads', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.sub

    const data = await request.file()
    if (!data) {
      reply.code(400)
      return { error: { code: 'NO_FILE', message: 'No file provided' } }
    }

    const mimeType = data.mimetype
    if (!MIME_ALLOWLIST.includes(mimeType)) {
      reply.code(400)
      return { error: { code: 'INVALID_MIME', message: `MIME type ${mimeType} not allowed` } }
    }

    const documentId = (data.fields as any)?.documentId?.value
    if (!documentId) {
      reply.code(400)
      return { error: { code: 'MISSING_DOCUMENT_ID', message: 'documentId is required' } }
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { folder: true },
    })
    if (!document) {
      reply.code(404)
      return { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } }
    }

    await assertFolderPermission(userId, request.user!.role, document.folderId, 'EDIT')

    const buffer = await data.toBuffer()
    const sizeBytes = buffer.length

    if (sizeBytes > MAX_FILE_SIZE) {
      reply.code(413)
      return { error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 25 MB limit' } }
    }

    // Check/create quota
    let quota = await prisma.userQuota.findUnique({ where: { userId } })
    if (!quota) {
      quota = await prisma.userQuota.create({
        data: {
          userId,
          maxStorageBytes: BigInt(5 * 1024 * 1024 * 1024),
          usedStorageBytes: BigInt(0),
        },
      })
    }

    const usedBytes = Number(quota.usedStorageBytes)
    const maxBytes = Number(quota.maxStorageBytes)
    const newUsed = usedBytes + sizeBytes
    if (newUsed > maxBytes) {
      reply.code(413)
      return {
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Storage quota exceeded (${(maxBytes / 1024 / 1024 / 1024).toFixed(1)} GB limit)`,
        },
      }
    }

    const ext = extname(data.filename)
    const objectKey = `${userId}/${randomUUID()}${ext}`

    const minio = getMinioClient()
    await minio.putObject(MINIO_BUCKET, objectKey, buffer, sizeBytes, {
      'Content-Type': mimeType,
    })

    const upload = await prisma.upload.create({
      data: {
        documentId,
        fileName: data.filename,
        mimeType,
        sizeBytes,
        objectKey,
        createdById: userId,
      },
    })

    await prisma.userQuota.update({
      where: { userId },
      data: { usedStorageBytes: BigInt(newUsed) },
    })

    reply.code(201)
    return {
      upload: {
        id: upload.id,
        url: `/api/uploads/${upload.id}`,
        fileName: upload.fileName,
        sizeBytes: upload.sizeBytes,
      },
    }
  })

  // GET /api/uploads/:id — file download
  app.get<{ Params: { id: string } }>('/api/uploads/:id', { preHandler: [verifyAuth] }, async (request, reply) => {
    const upload = await prisma.upload.findUnique({
      where: { id: request.params.id },
      include: { document: { select: { folderId: true } } },
    })
    if (!upload) {
      reply.code(404)
      return { error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload not found' } }
    }

    await assertFolderPermission(
      request.user!.sub,
      request.user!.role,
      upload.document?.folderId ?? null,
      'VIEW',
    )

    const minio = getMinioClient()
    const stream = await minio.getObject(MINIO_BUCKET, upload.objectKey)

    reply.header('Content-Type', upload.mimeType)
    reply.header('Content-Disposition', `inline; filename="${upload.fileName}"`)
    reply.header('Content-Length', String(upload.sizeBytes))
    return reply.send(stream)
  })

  // GET /api/users/me/quota — current user quota
  app.get('/api/users/me/quota', { preHandler: [verifyAuth] }, async (request) => {
    const userId = request.user!.sub
    let quota = await prisma.userQuota.findUnique({ where: { userId } })
    if (!quota) {
      quota = await prisma.userQuota.create({
        data: { userId, maxStorageBytes: BigInt(5 * 1024 * 1024 * 1024), usedStorageBytes: BigInt(0) },
      })
    }
    return {
      maxBytes: Number(quota.maxStorageBytes),
      usedBytes: Number(quota.usedStorageBytes),
      availableBytes: Number(quota.maxStorageBytes) - Number(quota.usedStorageBytes),
    }
  })
}
