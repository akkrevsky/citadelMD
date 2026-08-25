import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { GitService } from '@citadelmd/shared'

// Mock prisma + the file lock so the service logic is unit-testable.
vi.mock('../prisma.js', () => ({
  prisma: {
    folder: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    folderPermission: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('./lock.js', () => ({
  withFileLock: vi.fn(async (_path: string, fn: () => Promise<unknown>) => fn()),
}))

import { prisma } from '../prisma.js'
import {
  getEffectivePermission,
  computeEffectivePermissionFromAncestors,
  sanitizeLoginForGitPath,
  ensurePersonalFolder,
} from './folder.service.js'

const mockFolderFindUnique = vi.mocked(prisma.folder.findUnique)
const mockFolderFindFirst = vi.mocked(prisma.folder.findFirst)
const mockFolderCreate = vi.mocked(prisma.folder.create)
const mockPermFindMany = vi.mocked(prisma.folderPermission.findMany)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)

let tmp: string

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'citadelmd-folders-test-'))
  process.env.GIT_REPO_PATH = tmp
  const git = new GitService(tmp)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@citadelmd.local')
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sanitizeLoginForGitPath', () => {
  it('sanitizes spaces, case and symbols', () => {
    expect(sanitizeLoginForGitPath('Alice B.')).toBe('alice-b')
    expect(sanitizeLoginForGitPath('Иван Петров')).toBe('иван-петров')
    expect(sanitizeLoginForGitPath('  x--y  ')).toBe('x-y')
  })

  it('falls back to user for empty results', () => {
    expect(sanitizeLoginForGitPath('@@@')).toBe('user')
  })
})

describe('computeEffectivePermissionFromAncestors', () => {
  const folderMap = new Map<string, { id: string; parentId: string | null; name: string }>([
    ['root', { id: 'root', parentId: null, name: 'root' }],
    ['child', { id: 'child', parentId: 'root', name: 'child' }],
  ])

  it('returns ADMIN when an owned folder is in the ancestry', () => {
    expect(
      computeEffectivePermissionFromAncestors('child', folderMap, new Map(), new Set(['root'])),
    ).toBe('ADMIN')
  })

  it('falls back to explicit permissions otherwise', () => {
    expect(
      computeEffectivePermissionFromAncestors('child', folderMap, new Map([['root', 'VIEW']])),
    ).toBe('VIEW')
    expect(computeEffectivePermissionFromAncestors('child', folderMap, new Map())).toBeNull()
  })
})

describe('getEffectivePermission', () => {
  it('returns ADMIN when the user owns an ancestor (personal root)', async () => {
    mockFolderFindUnique
      .mockResolvedValueOnce({ parentId: 'root' } as never)
      .mockResolvedValueOnce({ parentId: null } as never)
    mockFolderFindFirst.mockResolvedValue({ id: 'root' } as never)

    expect(await getEffectivePermission('user-1', 'child')).toBe('ADMIN')
    expect(mockPermFindMany).not.toHaveBeenCalled()
  })

  it('returns null without ownership or explicit permissions', async () => {
    mockFolderFindUnique
      .mockResolvedValueOnce({ parentId: 'root' } as never)
      .mockResolvedValueOnce({ parentId: null } as never)
    mockFolderFindFirst.mockResolvedValue(null)
    mockPermFindMany.mockResolvedValue([])

    expect(await getEffectivePermission('user-1', 'child')).toBeNull()
  })

  it('returns max explicit permission otherwise', async () => {
    mockFolderFindUnique
      .mockResolvedValueOnce({ parentId: 'root' } as never)
      .mockResolvedValueOnce({ parentId: null } as never)
    mockFolderFindFirst.mockResolvedValue(null)
    mockPermFindMany.mockResolvedValue([{ permission: 'EDIT' } as never])

    expect(await getEffectivePermission('user-1', 'child')).toBe('EDIT')
  })
})

describe('ensurePersonalFolder', () => {
  it('returns the existing personal root without writes', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'f1',
      ownerId: 'user-1',
      gitPath: 'users/alice',
    } as never)

    const result = await ensurePersonalFolder('user-1')
    expect(result.id).toBe('f1')
    expect(mockFolderCreate).not.toHaveBeenCalled()
  })

  it('creates the personal root with git dir and returns it', async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce(null) // no personal root
      .mockResolvedValueOnce(null) // base path free
      .mockResolvedValueOnce(null) // stillCollides check
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      login: 'alice',
      gitName: null,
      gitEmail: null,
    } as never)
    mockFolderCreate.mockResolvedValue({
      id: 'new',
      ownerId: 'user-1',
      gitPath: 'users/alice',
    } as never)

    const result = await ensurePersonalFolder('user-1')
    expect(result.id).toBe('new')
    expect(mockFolderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: null,
          gitPath: 'users/alice',
          ownerId: 'user-1',
        }),
      }),
    )
    await expect(fs.access(path.join(tmp, 'users/alice/.gitkeep'))).resolves.toBeUndefined()
  })

  it('re-fetches the winner on a P2002 provisioning race', async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      login: 'bob',
      gitName: null,
      gitEmail: null,
    } as never)
    mockFolderCreate.mockRejectedValueOnce({ code: 'P2002' } as never)
    mockFolderFindFirst.mockResolvedValue({
      id: 'winner',
      ownerId: 'user-1',
      gitPath: 'users/bob',
    } as never)

    const result = await ensurePersonalFolder('user-1')
    expect(result.id).toBe('winner')
  })

  it('adds a uuid suffix when the sanitized path collides', async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce(null) // no personal root
      .mockResolvedValueOnce({ id: 'other', gitPath: 'users/alice-b' } as never) // base taken
      .mockResolvedValueOnce(null) // suffixed path free
      .mockResolvedValueOnce(null) // stillCollides check
    mockUserFindUnique.mockResolvedValue({
      id: 'user-123456',
      login: 'Alice B.',
      gitName: null,
      gitEmail: null,
    } as never)
    mockFolderCreate.mockResolvedValue({
      id: 'new',
      ownerId: 'user-123456',
      gitPath: 'users/alice-b-user-1',
    } as never)

    await ensurePersonalFolder('user-123456')
    expect(mockFolderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gitPath: 'users/alice-b-user-1' }),
      }),
    )
  })
})
