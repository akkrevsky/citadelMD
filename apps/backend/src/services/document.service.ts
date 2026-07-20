import path from 'node:path'
import fs from 'node:fs/promises'
import { Redis } from 'ioredis'
import { GitService, createFileLock, type GitAuthor, type GitRevision } from '@citadelmd/shared'
import { prisma } from '../prisma.js'
import { RedisLockService } from './redis-lock.service.js'

// ========== Types ==========

export interface CreateDocumentInput {
  folderId: string
  title: string
  createdById: string
}

export interface UpdateDocumentInput {
  title: string
}

export interface DocumentMetadata {
  id: string
  folderId: string
  title: string
  filePath: string
  createdAt: Date
  updatedAt: Date
  createdById: string | null
  hasUncommittedChanges: boolean
}

export interface DocumentRevision extends GitRevision {
  // Extends GitRevision with any additional metadata if needed
}

// ========== Service ==========

export class DocumentService {
  private git: GitService
  private withFileLock: ReturnType<typeof createFileLock>
  private redisLock: RedisLockService
  private yjsServerUrl: string

  constructor() {
    const repoPath = this.getGitRepoPath()
    this.git = new GitService(repoPath)
    
    // Initialize Redis client for file locking
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const redis = new Redis(redisUrl)
    
    this.withFileLock = createFileLock(redis)
    this.redisLock = new RedisLockService(redisUrl)
    this.yjsServerUrl = process.env.YJS_SERVER_URL || 'http://localhost:1234'
  }

  // ========== Core Methods ==========

  /**
   * Create a new document with initial Git commit
   */
  async createDocument(input: CreateDocumentInput): Promise<DocumentMetadata> {
    const { folderId, title, createdById } = input

    // Validate folder exists
    const folder = await prisma.folder.findUnique({ 
      where: { id: folderId },
      select: { gitPath: true }
    })
    if (!folder) {
      throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
    }

    // Check for duplicate title in folder
    const existing = await prisma.document.findFirst({
      where: { folderId, title }
    })
    if (existing) {
      throw Object.assign(new Error('Document with this title already exists in the folder'), {
        statusCode: 409
      })
    }

    const fileName = this.sanitizeFileName(title) + '.md'
    const filePath = folder.gitPath ? `${folder.gitPath}/${fileName}` : fileName
    const fullPath = path.join(this.getGitRepoPath(), filePath)

    // Get user for Git author
    const user = await prisma.user.findUnique({
      where: { id: createdById },
      select: { login: true, gitName: true, gitEmail: true }
    })
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    // Create document with file lock
    return this.withFileLock(filePath, async () => {
      // Write initial content
      const initialContent = `# ${title}\n\n`
      await fs.writeFile(fullPath, initialContent, 'utf8')

      // Git commit
      const result = await this.git.commit(
        `Create document ${title} [user:${user.login}]`,
        author
      )

      if (!result) {
        throw new Error('Failed to commit document creation')
      }

      // Create in database
      const document = await prisma.document.create({
        data: {
          folderId,
          title,
          filePath,
          createdById
        }
      })

      return {
        ...document,
        hasUncommittedChanges: false
      }
    })
  }

  /**
   * Get document metadata with uncommitted changes flag
   */
  async getDocument(id: string): Promise<DocumentMetadata | null> {
    const document = await prisma.document.findUnique({
      where: { id }
    })
    
    if (!document) {
      return null
    }

    // Check for uncommitted changes
    const hasUncommittedChanges = await this.git.hasUncommittedChanges(document.filePath)

    return {
      ...document,
      hasUncommittedChanges
    }
  }

  /**
   * Get document content from working tree
   */
  async getDocumentContent(id: string): Promise<string | null> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      return null
    }

    const fullPath = path.join(this.getGitRepoPath(), document.filePath)
    
    try {
      return await fs.readFile(fullPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  /**
   * Commit working tree changes with Redis locking
   */
  async commitChanges(id: string, message: string, userId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true }
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    await this.withFileLock(document.filePath, async () => {
      const result = await this.git.commit(message, author)
      if (!result) {
        throw new Error('No changes to commit')
      }
    })
  }

  /**
   * Discard uncommitted changes with Redis locking
   */
  async discardChanges(id: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    await this.withFileLock(document.filePath, async () => {
      await this.git.discard(document.filePath)
    })
  }

  /**
   * Get uncommitted diff (working tree vs HEAD)
   */
  async getUncommittedDiff(id: string): Promise<string | null> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      return null
    }

    return await this.git.diffUncommitted(document.filePath)
  }

  /**
   * Get document revision history
   */
  async getDocumentRevisions(id: string, limit?: number): Promise<DocumentRevision[]> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      return []
    }

    return await this.git.getRevisions(document.filePath, limit)
  }

  /**
   * Get content of specific revision
   */
  async getRevisionContent(id: string, sha: string): Promise<string | null> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      return null
    }

    try {
      return await this.git.show(document.filePath, sha)
    } catch (error) {
      return null
    }
  }

  /**
   * Restore document to specific revision with new commit
   */
  async restoreToRevision(id: string, sha: string, userId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true }
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    await this.withFileLock(document.filePath, async () => {
      await this.git.restore(document.filePath, sha, author)
    })
  }

  /**
   * Update document metadata (title rename with git mv)
   */
  async updateDocument(id: string, updates: UpdateDocumentInput, userId: string): Promise<DocumentMetadata> {
    const document = await prisma.document.findUnique({
      where: { id },
      include: { folder: { select: { gitPath: true } } }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const { title: newTitle } = updates
    
    // Check for duplicate title in same folder
    const existing = await prisma.document.findFirst({
      where: { 
        folderId: document.folderId, 
        title: newTitle,
        id: { not: id }
      }
    })
    if (existing) {
      throw Object.assign(new Error('Document with this title already exists in the folder'), {
        statusCode: 409
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true }
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    const newFileName = this.sanitizeFileName(newTitle) + '.md'
    const newFilePath = document.folder.gitPath
      ? `${document.folder.gitPath}/${newFileName}`
      : newFileName

    return this.withFileLock(document.filePath, async () => {
      // Git mv old -> new
      await this.git.move(document.filePath, newFilePath)

      // Commit the rename
      const result = await this.git.commit(
        `Rename document ${document.title} -> ${newTitle} [user:${user.login}]`,
        author
      )

      if (!result) {
        throw new Error('Failed to commit document rename')
      }

      // Update database
      const updated = await prisma.document.update({
        where: { id },
        data: {
          title: newTitle,
          filePath: newFilePath
        }
      })

      return {
        ...updated,
        hasUncommittedChanges: false
      }
    })
  }

  /**
   * Delete document with Git removal and commit
   */
  async deleteDocument(id: string, userId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true, title: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true }
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    await this.withFileLock(document.filePath, async () => {
      // Git rm
      await this.git.remove(document.filePath)

      // Commit the deletion
      const result = await this.git.commit(
        `Delete document ${document.title} [user:${user.login}]`,
        author
      )

      if (!result) {
        throw new Error('Failed to commit document deletion')
      }

      // Remove from database
      await prisma.document.delete({
        where: { id }
      })
    })
  }

  /**
   * Commit document changes with Yjs flush + git commit
   */
  async commitDocument(id: string, message: string, userId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true }
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`
    }

    await this.redisLock.withFileLock(document.filePath, async () => {
      // Flush Yjs document if active sessions exist
      if (await this.hasActiveYjsSession(id)) {
        await this.flushYjsDocument(id)
      }

      const result = await this.git.commit(message, author)
      if (!result) {
        throw new Error('No changes to commit')
      }
    })
  }

  /**
   * Discard document changes with git checkout + Yjs reload
   */
  async discardDocument(id: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    await this.redisLock.withFileLock(document.filePath, async () => {
      await this.git.discard(document.filePath)

      // Reload Yjs document if active sessions exist
      if (await this.hasActiveYjsSession(id)) {
        await this.reloadYjsDocument(id)
      }
    })
  }

  /**
   * Check if document has active Yjs sessions
   */
  async hasActiveYjsSession(docId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.yjsServerUrl}/internal/yjs-session-active?docid=${encodeURIComponent(docId)}`)
      if (!response.ok) {
        return false
      }
      const data = await response.json() as { active: boolean }
      return data.active === true
    } catch {
      // Graceful fallback if yjs-server is unavailable
      return false
    }
  }

  /**
   * Flush Yjs document to file
   */
  private async flushYjsDocument(docId: string): Promise<void> {
    const response = await fetch(`${this.yjsServerUrl}/internal/flush?docid=${encodeURIComponent(docId)}`, {
      method: 'POST'
    })
    if (!response.ok) {
      const error = await response.json() as { error: string }
      throw new Error(`Failed to flush Yjs document: ${error.error}`)
    }
  }

  /**
   * Reload Yjs document from file
   */
  private async reloadYjsDocument(docId: string): Promise<void> {
    const response = await fetch(`${this.yjsServerUrl}/internal/reload?docid=${encodeURIComponent(docId)}`, {
      method: 'POST'
    })
    if (!response.ok) {
      const error = await response.json() as { error: string }
      throw new Error(`Failed to reload Yjs document: ${error.error}`)
    }
  }

  // ========== Helpers ==========

  private getGitRepoPath(): string {
    const repoPath = process.env.GIT_REPO_PATH
    if (!repoPath) {
      throw new Error('GIT_REPO_PATH env var is required')
    }
    return repoPath
  }

  /**
   * Sanitize filename for file system
   */
  private sanitizeFileName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

// Create default instance only when needed and env is available
export function getDocumentService(): DocumentService {
  return new DocumentService()
}