import type { FolderPermissionLevel } from '@citadelmd/shared'
import { prisma } from '../prisma.js'
import { getEffectivePermission } from './folder.service.js'

const LEVEL: Record<FolderPermissionLevel, number> = {
  VIEW: 0,
  EDIT: 1,
  ADMIN: 2,
}

/** Resolve the folder a document lives in (or null if the document does not exist). */
export async function getDocumentFolderId(docId: string): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { folderId: true },
  })
  return doc?.folderId ?? null
}

/**
 * Assert the user has at least `required` permission on the folder.
 *
 * Admins bypass folder-level permissions. Throws 404 when the folder is
 * unknown, 403 when the user has no access or insufficient access. Callers
 * should pass `userRole` from the JWT/API-key payload (request.user.role).
 */
export async function assertFolderPermission(
  userId: string,
  userRole: string | undefined,
  folderId: string | null,
  required: FolderPermissionLevel,
): Promise<void> {
  if (userRole === 'ADMIN') return

  if (!folderId) {
    throw Object.assign(new Error('Not found'), { statusCode: 404 })
  }

  const perm = await getEffectivePermission(userId, folderId)
  if (perm === null || LEVEL[perm] < LEVEL[required]) {
    throw Object.assign(new Error('Insufficient folder permission'), {
      statusCode: 403,
    })
  }
}
