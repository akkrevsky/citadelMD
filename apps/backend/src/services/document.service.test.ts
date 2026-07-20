import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DocumentService } from './document.service.js'
import { prisma } from '../prisma.js'
import { GitService } from '@citadelmd/shared'

describe('DocumentService', () => {
  let documentService: DocumentService
  let testRepoPath: string
  let testRedis: Redis
  let testUserId: string
  let testFolderId: string
  let originalEnv: typeof process.env

  beforeAll(async () => {
    // Save original env
    originalEnv = { ...process.env }
    
    // Setup test environment
    testRepoPath = path.join(process.cwd(), 'test-repo')
    process.env.GIT_REPO_PATH = testRepoPath
    process.env.REDIS_DB = '15' // Use test Redis DB
    
    // Clean and create test repo
    await fs.rm(testRepoPath, { recursive: true, force: true })
    await fs.mkdir(testRepoPath, { recursive: true })
    
    // Initialize Git repo
    const git = new GitService(testRepoPath)
    await git.init()
    await git.addConfig('user.name', 'Test User')
    await git.addConfig('user.email', 'test@example.com')
    
    // Setup Redis for tests (DB 15)
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15,
    })
    await testRedis.flushdb()

    // Create test user and folder
    testUserId = 'test-user-id'
    testFolderId = 'test-folder-id'
    
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

    // Create test folder in Git repo
    const folderPath = path.join(testRepoPath, 'test-folder')
    await fs.mkdir(folderPath, { recursive: true })
    await fs.writeFile(path.join(folderPath, '.gitkeep'), '')
    await git.commit('Initial test setup', {
      name: 'Test User',
      email: 'test@example.com'
    })
  })

  afterAll(async () => {
    // Restore env
    process.env = originalEnv
    
    // Cleanup
    await testRedis.disconnect()
    await fs.rm(testRepoPath, { recursive: true, force: true })
    
    // Clean test data
    await prisma.document.deleteMany({ where: { createdById: testUserId } })
    await prisma.folder.deleteMany({ where: { createdById: testUserId } })
    await prisma.user.deleteMany({ where: { id: testUserId } })
  })

  beforeEach(() => {
    documentService = new DocumentService()
  })

  afterEach(async () => {
    // Clean up documents created in tests
    await prisma.document.deleteMany({ where: { folderId: testFolderId } })
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

    it('should sanitize title for filename', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Test Document: Special & Chars!',
        createdById: testUserId
      }

      const result = await documentService.createDocument(input)
      expect(result.filePath).toBe('test-folder/test-document-special-chars.md')
    })

    it('should throw error if folder not found', async () => {
      const input = {
        folderId: 'non-existent-folder',
        title: 'Test Document',
        createdById: testUserId
      }

      await expect(documentService.createDocument(input)).rejects.toThrow('Folder not found')
    })

    it('should throw error if user not found', async () => {
      const input = {
        folderId: testFolderId,
        title: 'Test Document',
        createdById: 'non-existent-user'
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
      const result = await documentService.getDocument('non-existent-id')
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
      const content = await documentService.getDocumentContent('non-existent-id')
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
        documentService.commitChanges('non-existent-id', 'Test', testUserId)
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
        documentService.discardChanges('non-existent-id')
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
      const diff = await documentService.getUncommittedDiff('non-existent-id')
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
      const revisions = await documentService.getDocumentRevisions('non-existent-id')
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
      const content = await documentService.getRevisionContent('non-existent-id', 'some-sha')
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
        documentService.restoreToRevision('non-existent-id', 'some-sha', testUserId)
      ).rejects.toThrow('Document not found')
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
          'non-existent-id',
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

      // Verify Git commit
      const git = new GitService(testRepoPath)
      const log = await git.log()
      expect(log.latest?.message).toContain('Delete document Document to Delete')
    })

    it('should throw error if document not found', async () => {
      await expect(
        documentService.deleteDocument('non-existent-id', testUserId)
      ).rejects.toThrow('Document not found')
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