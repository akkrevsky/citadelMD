import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the folder.service dependency (also avoids loading lock.js / prisma).
vi.mock('./folder.service.js', () => ({
  getEffectivePermission: vi.fn(),
}))

// Mock prisma so getDocumentFolderId does not hit a database.
vi.mock('../prisma.js', () => ({
  prisma: {
    document: { findUnique: vi.fn() },
  },
}))

import { getEffectivePermission } from './folder.service.js'
import { prisma } from '../prisma.js'
import { assertFolderPermission, getDocumentFolderId } from './authz.js'

const mockGetEffectivePermission = vi.mocked(getEffectivePermission)
const mockFindUnique = vi.mocked(prisma.document.findUnique)

describe('authz', () => {
  beforeEach(() => {
    mockGetEffectivePermission.mockReset()
    mockFindUnique.mockReset()
  })

  describe('getDocumentFolderId', () => {
    it('returns folderId when the document exists', async () => {
      mockFindUnique.mockResolvedValue({ folderId: 'folder-1' } as never)
      expect(await getDocumentFolderId('doc-1')).toBe('folder-1')
    })

    it('returns null when the document does not exist', async () => {
      mockFindUnique.mockResolvedValue(null)
      expect(await getDocumentFolderId('missing')).toBeNull()
    })
  })

  describe('assertFolderPermission', () => {
    it('lets ADMIN bypass without checking permissions', async () => {
      await assertFolderPermission('user-1', 'ADMIN', 'folder-1', 'ADMIN')
      expect(mockGetEffectivePermission).not.toHaveBeenCalled()
    })

    it('throws 404 when the folder is null (document not found)', async () => {
      await expect(
        assertFolderPermission('user-1', 'VIEWER', null, 'VIEW'),
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it('throws 403 when the user has no explicit permission', async () => {
      mockGetEffectivePermission.mockResolvedValue(null)
      await expect(
        assertFolderPermission('user-1', 'VIEWER', 'folder-1', 'VIEW'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('throws 403 when the permission is below the required level', async () => {
      mockGetEffectivePermission.mockResolvedValue('VIEW')
      await expect(
        assertFolderPermission('user-1', 'VIEWER', 'folder-1', 'EDIT'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('resolves when the permission meets the required level', async () => {
      mockGetEffectivePermission.mockResolvedValue('EDIT')
      await expect(
        assertFolderPermission('user-1', 'EDITOR', 'folder-1', 'EDIT'),
      ).resolves.toBeUndefined()
    })

    it('resolves when the permission exceeds the required level', async () => {
      mockGetEffectivePermission.mockResolvedValue('ADMIN')
      await expect(
        assertFolderPermission('user-1', 'EDITOR', 'folder-1', 'VIEW'),
      ).resolves.toBeUndefined()
    })
  })
})
