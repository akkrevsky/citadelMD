import path from 'node:path'
import fs from 'node:fs/promises'
import { GitService, type GitAuthor, type GitRevision } from '@citadelmd/shared'
import { prisma } from '../prisma.js'
import { withFileLock } from './lock.js'

/** Yjs WebSocket sessions use `doc-<uuid>`; DB document ids are bare UUIDs. */
export function toYjsDocId(documentId: string): string {
  return documentId.startsWith('doc-') ? documentId : `doc-${documentId}`
}

// ========== Types ==========

export interface CreateDocumentInput {
  folderId: string
  title: string
  createdById: string
  kind?: 'MARKDOWN' | 'EXCALIDRAW'
  /** Override the default initial content (used by file import). */
  initialContent?: string
}

export interface UpdateDocumentInput {
  title: string
}

export interface DocumentMetadata {
  id: string
  folderId: string
  title: string
  kind: 'MARKDOWN' | 'EXCALIDRAW'
  filePath: string
  createdAt: Date
  updatedAt: Date
  createdById: string | null
  hasUncommittedChanges: boolean
  folderMode: 'GIT' | 'SNAPSHOT'
}

export interface DocumentRevision extends GitRevision {
  // Extends GitRevision with any additional metadata if needed
}

// ========== Service ==========

export class DocumentService {
  private git: GitService
  private yjsServerUrl: string

  constructor() {
    const repoPath = this.getGitRepoPath()
    this.git = new GitService(repoPath)
    this.yjsServerUrl = process.env.YJS_SERVER_URL || 'http://localhost:1234'
  }

  // ========== Core Methods ==========

  /**
   * Create a new document with initial Git commit
   */
  async createDocument(input: CreateDocumentInput): Promise<DocumentMetadata> {
    const { folderId, title, createdById } = input
    const kind = input.kind === 'EXCALIDRAW' ? 'EXCALIDRAW' : 'MARKDOWN'

    // Validate folder exists
    const folder = await prisma.folder.findUnique({ 
      where: { id: folderId },
      select: { gitPath: true, mode: true }
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

    const ext = kind === 'EXCALIDRAW' ? '.excalidraw' : '.md'
    const fileName = this.sanitizeFileName(title) + ext
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
    return withFileLock(filePath, async () => {
      const initialContent =
        input.initialContent ??
        (kind === 'EXCALIDRAW'
          ? JSON.stringify(
              {
                type: 'excalidraw',
                version: 2,
                source: 'citadelmd',
                elements: [],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {},
              },
              null,
              2,
            )
          : `# ${title}\n\n`)
      await fs.writeFile(fullPath, initialContent, 'utf8')

      if (folder.mode === 'GIT') {
        const label = kind === 'EXCALIDRAW' ? 'diagram' : 'document'
        const result = await this.git.commit(
          `Create ${label} ${title} [user:${user.login}]`,
          author,
          [filePath]
        )

        if (!result) {
          throw new Error('Failed to commit document creation')
        }
      }

      // Create in database
      const document = await prisma.document.create({
        data: {
          folderId,
          title,
          kind,
          filePath,
          createdById
        }
      })

      return {
        ...document,
        hasUncommittedChanges: false,
        folderMode: folder.mode,
      }
    })
  }

  /**
   * Get document metadata with uncommitted changes flag
   */
  async getDocument(id: string): Promise<DocumentMetadata | null> {
    const document = await prisma.document.findUnique({
      where: { id },
      include: { folder: { select: { mode: true } } },
    })
    
    if (!document) {
      return null
    }

    const folderMode = document.folder.mode
    const hasUncommittedChanges =
      folderMode === 'GIT'
        ? await this.git.hasUncommittedChanges(document.filePath)
        : false

    const { folder: _folder, ...doc } = document
    return {
      ...doc,
      hasUncommittedChanges,
      folderMode,
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

    await withFileLock(document.filePath, async () => {
      const result = await this.git.commit(message, author, [document.filePath])
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

    await withFileLock(document.filePath, async () => {
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
   * Get unified diff for a specific revision (vs its parent commit).
   */
  async getRevisionDiff(id: string, sha: string): Promise<string | null> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true, folder: { select: { mode: true } } },
    })

    if (!document || document.folder.mode !== 'GIT') {
      return null
    }

    const revisions = await this.git.getRevisions(document.filePath)
    const idx = revisions.findIndex((r) => r.sha === sha || r.sha.startsWith(sha))
    const parentSha = idx >= 0 && idx < revisions.length - 1 ? revisions[idx + 1].sha : null

    try {
      if (parentSha) {
        return await this.git.diff(document.filePath, parentSha, sha)
      }
      try {
        return await this.git.diff(document.filePath, `${sha}^`, sha)
      } catch {
        return await this.git.diffFromRoot(document.filePath, sha)
      }
    } catch {
      return null
    }
  }

  private async touchUpdatedAt(id: string): Promise<Date> {
    const updated = await prisma.document.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: { updatedAt: true },
    })
    return updated.updatedAt
  }

  /**
   * Restore document to specific revision with new commit
   */
  async restoreToRevision(id: string, sha: string, userId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true, kind: true }
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

    await withFileLock(document.filePath, async () => {
      await this.git.restore(document.filePath, sha, author)

      if (document.kind === 'MARKDOWN') {
        await this.tryReloadYjsDocument(id)
      }
    })

    await this.touchUpdatedAt(id)
  }

  /**
   * Update document metadata (title rename with git mv)
   */
  async updateDocument(id: string, updates: UpdateDocumentInput, userId: string): Promise<DocumentMetadata> {
    const document = await prisma.document.findUnique({
      where: { id },
      include: { folder: { select: { gitPath: true, mode: true } } },
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

    const ext = document.kind === 'EXCALIDRAW' ? '.excalidraw' : '.md'
    const newFileName = this.sanitizeFileName(newTitle) + ext
    const newFilePath = document.folder.gitPath
      ? `${document.folder.gitPath}/${newFileName}`
      : newFileName

    return withFileLock(document.filePath, async () => {
      // Git mv old -> new
      await this.git.move(document.filePath, newFilePath)

      // Commit the rename
      const result = await this.git.commit(
        `Rename document ${document.title} -> ${newTitle} [user:${user.login}]`,
        author,
        [] // git mv already staged the rename; commit staged only, no sweep
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
        hasUncommittedChanges: false,
        folderMode: document.folder.mode,
      }
    })
  }

  /**
   * Move document to another folder (git mv + DB update)
   */
  async moveDocument(id: string, targetFolderId: string, userId: string): Promise<DocumentMetadata> {
    const document = await prisma.document.findUnique({
      where: { id },
      include: { folder: { select: { gitPath: true, mode: true } } },
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    if (document.folderId === targetFolderId) {
      return {
        ...document,
        hasUncommittedChanges: false,
        folderMode: document.folder.mode,
      }
    }

    const targetFolder = await prisma.folder.findUnique({
      where: { id: targetFolderId },
      select: { gitPath: true, mode: true },
    })

    if (!targetFolder) {
      throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
    }

    const existing = await prisma.document.findFirst({
      where: {
        folderId: targetFolderId,
        title: document.title,
        id: { not: id },
      },
    })

    if (existing) {
      throw Object.assign(new Error('Document with this title already exists in the folder'), {
        statusCode: 409,
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, gitName: true, gitEmail: true },
    })

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
    }

    const author: GitAuthor = {
      name: user.gitName ?? user.login,
      email: user.gitEmail ?? `${user.login}@mdcollab.local`,
    }

    const fileName = path.basename(document.filePath)
    const newFilePath = targetFolder.gitPath ? `${targetFolder.gitPath}/${fileName}` : fileName

    // Write any pending Yjs edits to the old path so the move carries them
    await this.tryFlushYjsDocument(id)

    return withFileLock(document.filePath, async () => {
      const repoPath = this.getGitRepoPath()
      const destination = path.join(repoPath, newFilePath)

      // A file may already sit at the destination: either a real collision
      // (tracked file of another document) or a stale yjs auto-save artifact
      // left behind by an earlier move. Only the tracked case is a conflict.
      let destExists = false
      try {
        destExists = (await fs.stat(destination)).isFile()
      } catch {
        // destination does not exist — nothing to do
      }
      if (destExists) {
        const tracked = await this.git.isPathTracked(newFilePath)
        if (tracked) {
          throw Object.assign(
            new Error('A file with this name already exists in the target folder'),
            { statusCode: 409 },
          )
        }
        await fs.rm(destination, { force: true })
        await fs.rm(`${destination}.ydoc`, { force: true })
      }

      await this.git.move(document.filePath, newFilePath)

      // The sidecar follows the Yjs session; drop the old one so auto-save
      // cannot recreate the file at the old path (reload regenerates it).
      await fs.rm(path.join(repoPath, `${document.filePath}.ydoc`), { force: true })

      const result = await this.git.commit(
        `Move document ${document.title} [user:${user.login}]`,
        author,
        [],
      )

      if (!result) {
        throw new Error('Failed to commit document move')
      }

      const updated = await prisma.document.update({
        where: { id },
        data: {
          folderId: targetFolderId,
          filePath: newFilePath,
        },
      })

      // Point a live Yjs session at the new path
      await this.tryReloadYjsDocument(id, newFilePath)

      return {
        ...updated,
        hasUncommittedChanges: false,
        folderMode: targetFolder.mode,
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

    await withFileLock(document.filePath, async () => {
      // Git rm
      await this.git.remove(document.filePath)

      // Commit the deletion
      const result = await this.git.commit(
        `Delete document ${document.title} [user:${user.login}]`,
        author,
        [] // git rm already staged the deletion; commit staged only, no sweep
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
  async commitDocument(id: string, message: string, userId: string): Promise<{ updatedAt: Date }> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true, kind: true, folder: { select: { mode: true } } },
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    await withFileLock(document.filePath, async () => {
      if (document.kind === 'MARKDOWN') {
        await this.tryFlushYjsDocument(id)
      }

      if (document.folder.mode === 'SNAPSHOT') {
        return
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { login: true, gitName: true, gitEmail: true },
      })

      if (!user) {
        throw Object.assign(new Error('User not found'), { statusCode: 404 })
      }

      const author: GitAuthor = {
        name: user.gitName ?? user.login,
        email: user.gitEmail ?? `${user.login}@mdcollab.local`,
      }

      const result = await this.git.commit(message, author, [document.filePath])
      if (!result) {
        // The client's latest Yjs update may still be in flight over the
        // WebSocket when flush ran (the user presses Ctrl+S right after
        // typing). Give the update a moment to arrive, flush again, and
        // retry the commit once before giving up.
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (document.kind === 'MARKDOWN') {
          await this.tryFlushYjsDocument(id)
        }
        const retry = await this.git.commit(message, author, [document.filePath])
        if (!retry) {
          throw new Error('No changes to commit')
        }
      }
    })

    const updatedAt = await this.touchUpdatedAt(id)
    return { updatedAt }
  }

  /**
   * Discard document changes with git checkout + Yjs reload
   */
  async discardDocument(id: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { filePath: true, kind: true }
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    await withFileLock(document.filePath, async () => {
      await this.git.discard(document.filePath)

      if (document.kind === 'MARKDOWN') {
        await this.tryReloadYjsDocument(id)
      }
    })
  }

  /**
   * Check if document has active Yjs sessions
   */
  async hasActiveYjsSession(docId: string): Promise<boolean> {
    try {
      const yjsDocId = toYjsDocId(docId)
      const response = await fetch(`${this.yjsServerUrl}/internal/yjs-session-active?docid=${encodeURIComponent(yjsDocId)}`)
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

  private async tryFlushYjsDocument(documentId: string): Promise<void> {
    try {
      await this.flushYjsDocument(documentId)
    } catch {
      // Y.Doc not loaded in yjs-server (editor closed) — commit working tree as-is
    }
  }

  private async tryReloadYjsDocument(documentId: string, filePath?: string): Promise<void> {
    try {
      await this.reloadYjsDocument(documentId, filePath)
    } catch {
      // No live Yjs session to reload
    }
  }

  /**
   * Flush Yjs document to file
   */
  private async flushYjsDocument(docId: string): Promise<void> {
    const yjsDocId = toYjsDocId(docId)
    const response = await fetch(`${this.yjsServerUrl}/internal/flush?docid=${encodeURIComponent(yjsDocId)}`, {
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
  private async reloadYjsDocument(docId: string, filePath?: string): Promise<void> {
    const yjsDocId = toYjsDocId(docId)
    const pathParam = filePath ? `&filepath=${encodeURIComponent(filePath)}` : ''
    const response = await fetch(`${this.yjsServerUrl}/internal/reload?docid=${encodeURIComponent(yjsDocId)}${pathParam}`, {
      method: 'POST'
    })
    if (!response.ok) {
      const error = await response.json() as { error: string }
      throw new Error(`Failed to reload Yjs document: ${error.error}`)
    }
  }

  /**
   * Full-text search across all documents using git grep.
   * Returns matches enriched with document metadata.
   */
  async searchDocuments(
    query: string,
    folderId?: string,
  ): Promise<Array<{ documentId: string; filePath: string; line: number; match: string; title: string; folderId: string }>> {
    let folderGitPath: string | undefined
    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { gitPath: true },
      })
      if (!folder) return []
      folderGitPath = folder.gitPath
    }

    const results = await this.git.grep(query, folderGitPath)
    if (results.length === 0) return []

    // Look up documents by filePath
    const filePaths = [...new Set(results.map((r) => r.filePath))]
    const documents = await prisma.document.findMany({
      where: { filePath: { in: filePaths } },
      select: { id: true, filePath: true, title: true, folderId: true },
    })
    const docByPath = new Map(documents.map((d) => [d.filePath, d]))

    return results
      .map((r) => {
        const doc = docByPath.get(r.filePath)
        if (!doc) return null
        return { documentId: doc.id, filePath: r.filePath, line: r.line, match: r.match, title: doc.title, folderId: doc.folderId }
      })
      .filter(Boolean) as Array<{
        documentId: string
        filePath: string
        line: number
        match: string
        title: string
        folderId: string
      }>
  }

  /**
   * Update document content by overwriting the working tree file.
   * Checks for active Yjs sessions (409 Conflict if active).
   * Optionally commits the change.
   */
  async updateDocumentContent(
    id: string,
    content: string,
    userId: string,
    commit: boolean = false,
    message?: string,
  ): Promise<{ sha?: string }> {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, filePath: true, title: true, kind: true },
    })

    if (!document) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 })
    }

    const fullPath = path.join(this.getGitRepoPath(), document.filePath)

    return withFileLock(document.filePath, async () => {
      // Check for active Yjs sessions (markdown only)
      if (document.kind === 'MARKDOWN' && (await this.hasActiveYjsSession(id))) {
        throw Object.assign(
          new Error('Document has an active editing session — cannot overwrite via API'),
          { statusCode: 409 },
        )
      }

      // Overwrite the file
      await fs.writeFile(fullPath, content, 'utf8')
      await this.touchUpdatedAt(id)

      if (commit) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { login: true, gitName: true, gitEmail: true },
        })

        if (!user) {
          throw Object.assign(new Error('User not found'), { statusCode: 404 })
        }

        const author: GitAuthor = {
          name: user.gitName ?? user.login,
          email: user.gitEmail ?? `${user.login}@mdcollab.local`,
        }

        const commitMsg = message ?? `Update ${document.title} via MCP`
        const result = await this.git.commit(commitMsg, author, [document.filePath])
        if (!result) {
          throw new Error('No changes to commit')
        }
        return { sha: result.sha }
      }

      return {}
    })
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
    let name = title
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (!name) {
      name = 'untitled'
    }

    return name
  }
}

// Create default instance only when needed and env is available
export function getDocumentService(): DocumentService {
  return new DocumentService()
}