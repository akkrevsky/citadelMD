import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DocumentService, toYjsDocId } from './document.service.js'
import { prisma } from '../prisma.js'
import { GitService } from '@citadelmd/shared'

// Setup test environment
process.env.GIT_REPO_PATH = process.env.GIT_REPO_PATH || '/tmp/test-git-repo'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mdcollab:***@localhost:5432/mdcollab'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-256-bits-long-for-testing-0123456789abcdef'
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost'
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379'
process.env.REDIS_DB = '15' // Use test Redis DB

describe('toYjsDocId', () => {
  it('prefixes bare document uuid', () => {
    expect(toYjsDocId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'doc-550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('leaves already-prefixed ids unchanged', () => {
    expect(toYjsDocId('doc-550e8400-e29b-41d4-a716-446655440000')).toBe(
      'doc-550e8400-e29b-41d4-a716-446655440000',
    )
  })
})

describe('DocumentService', () => {
  let documentService: DocumentService
  let testRepoPath: string
  let testRedis: Redis
  let testUserId: string
  let testFolderId: string
  let testSnapshotFolderId: string
  let originalEnv: typeof process.env

  beforeAll(async () => {
    // Save original env
    originalEnv = { ...process.env }
    
    // Setup test environment
    testRepoPath = process.env.GIT_REPO_PATH!

    // Setup Redis for tests (DB 15)
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15,
    })
    
    try {
      await testRedis.flushdb()
    } catch (error) {
      console.warn('Could not connect to Redis, some tests may fail:', (error as Error).message)
    }

    // Create test user and folder
    testUserId = '00000000-0000-4000-8000-000000000001'
    testFolderId = '00000000-0000-4000-8000-000000000002'
    testSnapshotFolderId = '00000000-0000-4000-8000-000000000003'
    
    try {
      await prisma.user.upsert({
        where: { id: testUserId },
        update: {},
        create: {
          id: testUserId,
          login: 'testuser',
          passwordHash: 'hash',
          gitName: 'Test User',
          gitEmail: 'test@example.com'
        }
      })

      await prisma.folder.upsert({
        where: { id: testFolderId },
        update: {},
        create: {
          id: testFolderId,
          name: 'test-folder',
          gitPath: 'test-folder',
          createdById: testUserId
        }
      })

      await prisma.folder.upsert({
        where: { id: testSnapshotFolderId },
        update: {},
        create: {
          id: testSnapshotFolderId,
          name: 'snapshot-folder',
          gitPath: 'snapshot-folder',
          createdById: testUserId,
          mode: 'SNAPSHOT'
        }
      })
    } catch (error) {
      console.warn('Could not set up test data in database, some tests may fail:', (error as Error).message)
    }
  })

  afterAll(async () => {
    // Restore env
    process.env = originalEnv
    
    // Cleanup
    try {
      await testRedis.disconnect()
    } catch (error) {
      // Ignore
    }
    
    try {
      await fs.rm(testRepoPath, { recursive: true, force: true })
    } catch (error) {
      // Ignore
    }
    
    // Clean test data
    try {
      await prisma.document.deleteMany({ where: { createdById: testUserId } })
      await prisma.folder.deleteMany({ where: { createdById: testUserId } })
      await prisma.user.deleteMany({ where: { id: testUserId } })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    // Fresh Git repo per test: tests reuse the same file paths (e.g.
    // test-folder/test-document.md) and git history persists across tests,
    // which breaks revision-count assertions.
    await fs.rm(testRepoPath, { recursive: true, force: true })
    await fs.mkdir(testRepoPath, { recursive: true })

    const git = new GitService(testRepoPath)
    await git.init()
    await git.addConfig('user.name', 'Test User')
    await git.addConfig('user.email', 'test@example.com')

    const folderPath = path.join(testRepoPath, 'test-folder')
    await fs.mkdir(folderPath, { recursive: true })
    await fs.writeFile(path.join(folderPath, '.gitkeep'), '')

    // SNAPSHOT-mode documents are written directly without git, but the
    // folder dir still must exist on disk.
    await fs.mkdir(path.join(testRepoPath, 'snapshot-folder'), { recursive: true })
    await git.commit('Initial test setup', {
      name: 'Test User',
      email: 'test@example.com',
    })

    documentService = new DocumentService()
  })

  afterEach(async () => {
    // Clean up documents created in tests
    try {
      await prisma.document.deleteMany({ where: { folderId: testFolderId } })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('createDocument', () => {
    it('should create document with initial content and Git commit', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      }

      const result = await documentService.createDocument(input)

      expect(result).toMatchObject({
        folderId: testFolderId,
        title: 'Test Document',
        filePath: 'test-folder/test-document.md',
        createdById: testUserId,
        hasUncommittedChanges: false
      })

      // Verify file exists with correct content
      const content = await fs.readFile(
        path.join(testRepoPath, result.filePath),
        'utf8'
      )
      expect(content).toBe('# Test Document\n\n')

      // Verify Git commit exists
      const git = new GitService(testRepoPath)
      const log = await git.log(result.filePath)
      expect(log.latest?.message).toContain('Create document Test Document')
    })

    it('should create EXCALIDRAW diagram with .excalidraw JSON', async () => {
      const result = await documentService.createDocument({
        folderId: testFolderId,
        title: 'My Diagram',
        createdById: testUserId,
        kind: 'EXCALIDRAW',
      })

      expect(result).toMatchObject({
        folderId: testFolderId,
        title: 'My Diagram',
        kind: 'EXCALIDRAW',
        filePath: 'test-folder/my-diagram.excalidraw',
        hasUncommittedChanges: false,
      })

      const content = await fs.readFile(path.join(testRepoPath, result.filePath), 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed.type).toBe('excalidraw')
      expect(parsed.elements).toEqual([])
    })

    it('should create document with custom initial content (import)', async () => {
      const result = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Imported',
        createdById: testUserId,
        initialContent: '# Imported\n\nbody text',
      })

      expect(result.filePath).toBe('test-folder/imported.md')
      const content = await fs.readFile(path.join(testRepoPath, result.filePath), 'utf8')
      expect(content).toBe('# Imported\n\nbody text')
    })

    it('should sanitize title for filename', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Test Document: Special & Chars!',
        createdById: testUserId
      }

      const result = await documentService.createDocument(input)
      expect(result.filePath).toBe('test-folder/test-document-special-chars.md')
    })

    it('should preserve cyrillic letters in filename', async () => {
      const result = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Диаграмма',
        createdById: testUserId,
        kind: 'EXCALIDRAW',
      })

      expect(result.filePath).toBe('test-folder/диаграмма.excalidraw')
      expect(result.title).toBe('Диаграмма')
    })

    it('should throw error if folder not found', async () => {
      const input = {
        folderId: '00000000-0000-4000-8000-000000000099',
        title: 'Test Document',
        createdById: testUserId
      }

      await expect(documentService.createDocument(input)).rejects.toThrow('Folder not found')
    })

    it('should throw error if user not found', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Test Document',
        createdById: '00000000-0000-4000-8000-000000000098'
      }

      await expect(documentService.createDocument(input)).rejects.toThrow('User not found')
    })

    it('should throw error if title already exists in folder', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Duplicate Title',
        createdById: testUserId
      }

      // Create first document
      await documentService.createDocument(input)

      // Try to create duplicate
      await expect(documentService.createDocument(input)).rejects.toThrow(
        'Document with this title already exists in the folder'
      )
    })
  })

  describe('getDocument', () => {
    it('should return document metadata with uncommitted changes flag', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const result = await documentService.getDocument(created.id)

      expect(result).toMatchObject({
        id: created.id,
        title: 'Test Document',
        hasUncommittedChanges: false
      })
    })

    it('should detect uncommitted changes', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Modify file directly (simulating editor changes)
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nModified content', 'utf8')

      const result = await documentService.getDocument(created.id)
      expect(result?.hasUncommittedChanges).toBe(true)
    })

    it('should return null for non-existent document', async () => {
      const result = await documentService.getDocument('00000000-0000-4000-8000-000000000097')
      expect(result).toBeNull()
    })
  })

  describe('getDocumentContent', () => {
    it('should return document content from working tree', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const content = await documentService.getDocumentContent(created.id)
      expect(content).toBe('# Test Document\n\n')
    })

    it('should return null for non-existent document', async () => {
      const content = await documentService.getDocumentContent('00000000-0000-4000-8000-000000000097')
      expect(content).toBeNull()
    })
  })

  describe('commitChanges', () => {
    it('should commit working tree changes', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Modify file
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nNew content', 'utf8')

      await documentService.commitChanges(created.id, 'Update content', testUserId)

      // Verify no uncommitted changes
      const result = await documentService.getDocument(created.id)
      expect(result?.hasUncommittedChanges).toBe(false)

      // Verify Git commit
      const git = new GitService(testRepoPath)
      const log = await git.log(created.filePath)
      expect(log.latest?.message).toBe('Update content')
    })

    it('should throw error if no changes to commit', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      await expect(
        documentService.commitChanges(created.id, 'No changes', testUserId)
      ).rejects.toThrow('No changes to commit')
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.commitChanges('00000000-0000-4000-8000-000000000097', 'Test', testUserId)
      ).rejects.toThrow('Document not found')
    })
  })

  describe('discardChanges', () => {
    it('should discard uncommitted changes', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Modify file
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nModified content', 'utf8')

      // Verify changes exist
      let result = await documentService.getDocument(created.id)
      expect(result?.hasUncommittedChanges).toBe(true)

      // Discard changes
      await documentService.discardChanges(created.id)

      // Verify changes discarded
      result = await documentService.getDocument(created.id)
      expect(result?.hasUncommittedChanges).toBe(false)

      // Verify content restored
      const content = await documentService.getDocumentContent(created.id)
      expect(content).toBe('# Test Document\n\n')
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.discardChanges('00000000-0000-4000-8000-000000000097')
      ).rejects.toThrow('Document not found')
    })
  })

  describe('getUncommittedDiff', () => {
    it('should return diff between working tree and HEAD', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Modify file
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nModified content', 'utf8')

      const diff = await documentService.getUncommittedDiff(created.id)
      expect(diff).toContain('Modified content')
      expect(diff).toContain('# Test Document')
    })

    it('should return null for non-existent document', async () => {
      const diff = await documentService.getUncommittedDiff('00000000-0000-4000-8000-000000000097')
      expect(diff).toBeNull()
    })
  })

  describe('getDocumentRevisions', () => {
    it('should return revision history', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Make another commit
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nNew content', 'utf8')
      await documentService.commitChanges(created.id, 'Second commit', testUserId)

      const revisions = await documentService.getDocumentRevisions(created.id)
      expect(revisions).toHaveLength(2)
      expect(revisions[0].message).toBe('Second commit')
      expect(revisions[1].message).toContain('Create document Test Document')
    })

    it('should respect limit parameter', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Make another commit
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nNew content', 'utf8')
      await documentService.commitChanges(created.id, 'Second commit', testUserId)

      const revisions = await documentService.getDocumentRevisions(created.id, 1)
      expect(revisions).toHaveLength(1)
      expect(revisions[0].message).toBe('Second commit')
    })

    it('should return empty array for non-existent document', async () => {
      const revisions = await documentService.getDocumentRevisions('00000000-0000-4000-8000-000000000097')
      expect(revisions).toHaveLength(0)
    })
  })

  describe('getRevisionContent', () => {
    it('should return content of specific revision', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Get initial revision
      const revisions = await documentService.getDocumentRevisions(created.id)
      const initialSha = revisions[0].sha

      // Make another commit
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nNew content', 'utf8')
      await documentService.commitChanges(created.id, 'Second commit', testUserId)

      // Get content of initial revision
      const content = await documentService.getRevisionContent(created.id, initialSha)
      expect(content).toBe('# Test Document\n\n')
    })

    it('should return null for invalid revision', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const content = await documentService.getRevisionContent(created.id, 'invalid-sha')
      expect(content).toBeNull()
    })

    it('should return null for non-existent document', async () => {
      const content = await documentService.getRevisionContent('00000000-0000-4000-8000-000000000097', 'some-sha')
      expect(content).toBeNull()
    })
  })

  describe('restoreToRevision', () => {
    it('should restore document to specific revision', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      // Make a change and commit
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Test Document\n\nModified content', 'utf8')
      await documentService.commitChanges(created.id, 'Second commit', testUserId)

      // Get the initial revision
      const revisions = await documentService.getDocumentRevisions(created.id)
      const initialSha = revisions[1].sha // Second in array is first commit

      // Restore to initial revision
      await documentService.restoreToRevision(created.id, initialSha, testUserId)

      // Verify content restored
      const content = await documentService.getDocumentContent(created.id)
      expect(content).toBe('# Test Document\n\n')

      // Verify new commit created
      const newRevisions = await documentService.getDocumentRevisions(created.id, 1)
      expect(newRevisions[0].message).toContain(`restore ${created.filePath} to ${initialSha.substring(0, 8)}`)
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.restoreToRevision('00000000-0000-4000-8000-000000000097', 'some-sha', testUserId)
      ).rejects.toThrow('Document not found')
    })
  })

  describe('getRevisionDiff', () => {
    it('should return diff between a revision and its parent', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Updated Title\n\nNew content', 'utf8')
      await documentService.commitChanges(created.id, 'Second commit', testUserId)

      const revisions = await documentService.getDocumentRevisions(created.id)
      const diff = await documentService.getRevisionDiff(created.id, revisions[0].sha)

      expect(diff).toContain('+New content')
      expect(diff).toContain('+# Updated Title')
      expect(diff).toContain('-# Test Document')
    })

    it('should return the first-commit diff via the parent commit', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const revisions = await documentService.getDocumentRevisions(created.id)
      const firstSha = revisions[revisions.length - 1].sha

      const diff = await documentService.getRevisionDiff(created.id, firstSha)
      expect(diff).toContain('+# Test Document')
    })

    it('should return null for non-existent document', async () => {
      const diff = await documentService.getRevisionDiff(
        '00000000-0000-4000-8000-000000000097',
        'f'.repeat(40)
      )
      expect(diff).toBeNull()
    })

    it('should return null for unknown sha', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Test Document',
        createdById: testUserId
      })

      const diff = await documentService.getRevisionDiff(created.id, 'f'.repeat(40))
      expect(diff).toBeNull()
    })

    it('should return null for SNAPSHOT folders', async () => {
      const created = await documentService.createDocument({
        folderId: testSnapshotFolderId,
        title: 'Snapshot Doc',
        createdById: testUserId
      })

      const diff = await documentService.getRevisionDiff(created.id, 'f'.repeat(40))
      expect(diff).toBeNull()
    })
  })

  describe('updateDocument', () => {
    it('should rename document with git mv', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Original Title',
        createdById: testUserId
      })

      const result = await documentService.updateDocument(
        created.id,
        { title: 'New Title' },
        testUserId
      )

      expect(result.title).toBe('New Title')
      expect(result.filePath).toBe('test-folder/new-title.md')

      // Verify old file doesn't exist
      const oldPath = path.join(testRepoPath, created.filePath)
      await expect(fs.access(oldPath)).rejects.toThrow()

      // Verify new file exists
      const newPath = path.join(testRepoPath, result.filePath)
      await expect(fs.access(newPath)).resolves.toBeUndefined()

      // Verify Git commit
      const git = new GitService(testRepoPath)
      const log = await git.log(result.filePath)
      expect(log.latest?.message).toContain('Rename document Original Title -> New Title')
    })

    it('should rename EXCALIDRAW diagram keeping .excalidraw extension', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Diagram One',
        createdById: testUserId,
        kind: 'EXCALIDRAW',
      })

      const result = await documentService.updateDocument(
        created.id,
        { title: 'Diagram Two' },
        testUserId,
      )

      expect(result.title).toBe('Diagram Two')
      expect(result.kind).toBe('EXCALIDRAW')
      expect(result.filePath).toBe('test-folder/diagram-two.excalidraw')
      await expect(fs.access(path.join(testRepoPath, result.filePath))).resolves.toBeUndefined()
    })

    it('should throw error if new title already exists in folder', async () => {
      await documentService.createDocument({
        folderId: testFolderId,
        title: 'First Document',
        createdById: testUserId
      })

      const second = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Second Document',
        createdById: testUserId
      })

      await expect(
        documentService.updateDocument(
          second.id,
          { title: 'First Document' },
          testUserId
        )
      ).rejects.toThrow('Document with this title already exists in the folder')
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.updateDocument(
          '00000000-0000-4000-8000-000000000097',
          { title: 'New Title' },
          testUserId
        )
      ).rejects.toThrow('Document not found')
    })
  })

  describe('deleteDocument', () => {
    it('should delete document with git rm and commit', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Document to Delete',
        createdById: testUserId
      })

      await documentService.deleteDocument(created.id, testUserId)

      // Verify file doesn't exist
      const filePath = path.join(testRepoPath, created.filePath)
      await expect(fs.access(filePath)).rejects.toThrow()

      // Verify not in database
      const found = await documentService.getDocument(created.id)
      expect(found).toBeNull()

      // Verify Git commit - check folder history to see the deletion commit
      const git = new GitService(testRepoPath)
      const logResult = await git.log('test-folder') // Check folder history
      expect(logResult.latest?.message).toContain('Delete document Document to Delete')
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.deleteDocument('00000000-0000-4000-8000-000000000097', testUserId)
      ).rejects.toThrow('Document not found')
    })
  })

  describe('moveDocument', () => {
    it('moves the file to the target folder and updates filePath', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Move Me',
        createdById: testUserId,
      })
      const oldPath = path.join(testRepoPath, created.filePath)

      const moved = await documentService.moveDocument(created.id, testSnapshotFolderId, testUserId)

      expect(moved.folderId).toBe(testSnapshotFolderId)
      expect(moved.filePath).toBe('snapshot-folder/move-me.md')
      // Old file gone, new file exists on disk
      await expect(fs.access(oldPath)).rejects.toThrow()
      await expect(fs.access(path.join(testRepoPath, moved.filePath))).resolves.toBeUndefined()
    })

    it('removes a stale untracked file at the destination instead of failing', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Stale Destination',
        createdById: testUserId,
      })

      // Simulate a yjs auto-save artifact left at the old location by a
      // previous move: an untracked file sitting at the destination.
      const stalePath = path.join(testRepoPath, 'snapshot-folder', 'stale-destination.md')
      await fs.writeFile(stalePath, 'stale leftover')

      const moved = await documentService.moveDocument(created.id, testSnapshotFolderId, testUserId)

      expect(moved.filePath).toBe('snapshot-folder/stale-destination.md')
      const content = await fs.readFile(path.join(testRepoPath, moved.filePath), 'utf8')
      expect(content).not.toBe('stale leftover')
    })

    it('rejects with 409 when a tracked file already exists at the destination', async () => {
      // Doc in test-folder committed to git
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Tracked Collision',
        createdById: testUserId,
      })

      // A second tracked file at the same destination path (another doc's
      // file committed to the target folder)
      const colliding = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Tracked Collision Clone',
        createdById: testUserId,
      })
      // Move the clone to the snapshot folder... snapshot files are untracked,
      // so simulate a tracked destination by committing the clone's file in
      // the target folder through the git service directly.
      const git = new GitService(testRepoPath)
      const clonePath = path.join(testRepoPath, colliding.filePath)
      const destPath = path.join(testRepoPath, 'snapshot-folder', 'tracked-collision.md')
      await fs.copyFile(clonePath, destPath)
      await git.commit('Tracked destination setup', { name: 'Test User', email: 'test@example.com' }, [
        'snapshot-folder/tracked-collision.md',
      ])

      await expect(
        documentService.moveDocument(created.id, testSnapshotFolderId, testUserId),
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('does nothing when the document is already in the target folder', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'No-op Move',
        createdById: testUserId,
      })

      const moved = await documentService.moveDocument(created.id, testFolderId, testUserId)

      expect(moved.filePath).toBe(created.filePath)
    })
  })

  describe('concurrency and locking', () => {
    it('should handle concurrent operations safely with Redis locking', async () => {
      const created = await documentService.createDocument({
        folderId: testFolderId,
        title: 'Concurrent Test',
        createdById: testUserId
      })

      // Modify file to have changes to commit
      const filePath = path.join(testRepoPath, created.filePath)
      await fs.writeFile(filePath, '# Concurrent Test\n\nContent for commit', 'utf8')

      // Try concurrent operations (only one should succeed at a time)
      const operations = [
        documentService.commitChanges(created.id, 'Commit 1', testUserId),
        // This will fail because the first commit will succeed and there will be no changes left
        documentService.commitChanges(created.id, 'Commit 2', testUserId).catch(e => e)
      ]

      const results = await Promise.all(operations)
      
      // One should succeed, one should fail
      const errors = results.filter(r => r instanceof Error)
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('No changes to commit')
    })
  })
})