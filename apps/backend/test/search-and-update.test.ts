/**
 * Tests for search and update-content service methods (MCP support).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Use vi.hoisted so mock functions are available to both the factory and test body
const {
  mockGrep,
  mockCommit,
  mockHasUncommitted,
  mockPrismaDocFindUnique,
  mockPrismaDocFindMany,
  mockPrismaDocUpdate,
  mockPrismaFolderFindUnique,
  mockPrismaUserFindUnique,
} = vi.hoisted(() => ({
  mockGrep: vi.fn(),
  mockCommit: vi.fn(),
  mockHasUncommitted: vi.fn().mockResolvedValue(false),
  mockPrismaDocFindUnique: vi.fn(),
  mockPrismaDocFindMany: vi.fn(),
  mockPrismaDocUpdate: vi.fn(),
  mockPrismaFolderFindUnique: vi.fn(),
  mockPrismaUserFindUnique: vi.fn(),
}))

// Mock @citadelmd/shared
vi.mock('@citadelmd/shared', () => ({
  GitService: vi.fn().mockImplementation(() => ({
    grep: mockGrep,
    commit: mockCommit,
    hasUncommittedChanges: mockHasUncommitted,
    discard: vi.fn(),
    restore: vi.fn(),
    diffUncommitted: vi.fn(),
    diff: vi.fn(),
    show: vi.fn(),
    log: vi.fn(),
    getRevisions: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
  })),
}))

// Mock prisma
vi.mock('../src/prisma.js', () => ({
  prisma: {
    document: {
      findUnique: mockPrismaDocFindUnique,
      findMany: mockPrismaDocFindMany,
      create: vi.fn(),
      findFirst: vi.fn(),
      update: mockPrismaDocUpdate,
      delete: vi.fn(),
    },
    folder: {
      findUnique: mockPrismaFolderFindUnique,
    },
    user: {
      findUnique: mockPrismaUserFindUnique,
      findMany: vi.fn(),
    },
    folderPermission: { findMany: vi.fn() },
    share: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

// Mock lock — just pass through the wrapped function
const { mockWithFileLock } = vi.hoisted(() => ({
  mockWithFileLock: vi.fn((_path: string, fn: () => Promise<any>) => fn()),
}))

vi.mock('../src/services/lock.js', () => ({
  withFileLock: mockWithFileLock,
  redis: { on: vi.fn() },
}))

import { DocumentService } from '../src/services/document.service.js'
import fs from 'node:fs/promises'

// Set required env
process.env.GIT_REPO_PATH = '/tmp/test-git-repo'
process.env.YJS_SERVER_URL = 'http://localhost:1234'

describe('DocumentService.searchDocuments', () => {
  let service: DocumentService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DocumentService()
  })

  it('runs git grep and enriches with document metadata', async () => {
    mockGrep.mockResolvedValue([
      { filePath: 'Docs/note.md', line: 5, match: 'hello world' },
    ])
    mockPrismaDocFindMany.mockResolvedValue([
      { id: 'doc-1', filePath: 'Docs/note.md', title: 'Note', folderId: 'folder-1' },
    ])

    const results = await service.searchDocuments('hello')

    expect(mockGrep).toHaveBeenCalledWith('hello', undefined)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      documentId: 'doc-1',
      title: 'Note',
      line: 5,
      match: 'hello world',
      folderId: 'folder-1',
    })
  })

  it('scopes search by folder gitPath when folderId is given', async () => {
    mockPrismaFolderFindUnique.mockResolvedValue({ gitPath: 'Docs' })
    mockGrep.mockResolvedValue([])

    await service.searchDocuments('hello', 'folder-1')

    expect(mockGrep).toHaveBeenCalledWith('hello', 'Docs')
  })

  it('returns empty array when folder not found', async () => {
    mockPrismaFolderFindUnique.mockResolvedValue(null)

    const results = await service.searchDocuments('hello', 'missing')

    expect(results).toEqual([])
    expect(mockGrep).not.toHaveBeenCalled()
  })

  it('skips results for documents not in the database', async () => {
    mockGrep.mockResolvedValue([
      { filePath: 'Docs/exists.md', line: 5, match: 'exists' },
      { filePath: 'Docs/deleted.md', line: 1, match: 'gone' },
    ])
    mockPrismaDocFindMany.mockResolvedValue([
      { id: 'doc-1', filePath: 'Docs/exists.md', title: 'Exists', folderId: 'f1' },
    ])

    const results = await service.searchDocuments('test')

    expect(results).toHaveLength(1)
    expect(results[0].filePath).toBe('Docs/exists.md')
  })
})

describe('DocumentService.updateDocumentContent', () => {
  let service: DocumentService
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DocumentService()
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined)
    mockPrismaDocUpdate.mockResolvedValue({ updatedAt: new Date() })
  })

  it('writes content when no Yjs session is active', async () => {
    mockPrismaDocFindUnique.mockResolvedValue({
      id: 'doc-1',
      filePath: 'Docs/note.md',
      title: 'Note',
      kind: 'MARKDOWN',
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ active: false }),
    })

    const result = await service.updateDocumentContent('doc-1', '# Updated', 'user-1')
    expect(result).toEqual({})
  })

  it('throws 409 when Yjs session is active', async () => {
    mockPrismaDocFindUnique.mockResolvedValue({
      id: 'doc-1',
      filePath: 'Docs/note.md',
      title: 'Note',
      kind: 'MARKDOWN',
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ active: true }),
    })

    await expect(
      service.updateDocumentContent('doc-1', '# Updated', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('throws 404 when document does not exist', async () => {
    mockPrismaDocFindUnique.mockResolvedValue(null)

    await expect(
      service.updateDocumentContent('doc-missing', '# Updated', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('commits when commit=true and returns sha', async () => {
    mockPrismaDocFindUnique.mockResolvedValue({
      id: 'doc-1',
      filePath: 'Docs/note.md',
      title: 'Note',
      kind: 'MARKDOWN',
    })

    mockPrismaUserFindUnique.mockResolvedValue({
      id: 'user-1',
      login: 'editor',
      gitName: 'Editor',
      gitEmail: 'editor@mdcollab.local',
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ active: false }),
    })

    mockCommit.mockResolvedValue({ sha: 'abc123', message: 'Update via MCP' })

    const result = await service.updateDocumentContent(
      'doc-1',
      '# Updated',
      'user-1',
      true,
      'Update via MCP',
    )

    expect(result).toEqual({ sha: 'abc123' })
    expect(mockCommit).toHaveBeenCalled()
  })
})
