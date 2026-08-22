import * as Y from 'yjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname } from 'path'
import { mkdirSync } from 'fs'
import fastDiff from 'fast-diff'
import { Redis } from 'ioredis'
import { createTryFileLock, type FileLockReleaser } from '@citadelmd/shared'

export interface DocumentSession {
  ydoc: Y.Doc
  filePath: string
  lastSave: number
  connections: Set<string> // connection IDs
  autoSaveTimer?: NodeJS.Timeout
}

export class YjsManager {
  private documents = new Map<string, DocumentSession>()
  private readonly gitRepoPath: string
  private readonly gracePeriodMs: number
  private readonly autoSaveInterval = 5000 // 5 seconds
  private readonly tryLock: (filePath: string) => Promise<FileLockReleaser | null>

  constructor(
    gitRepoPath = process.env.GIT_REPO_PATH || '/var/lib/md-collab/docs',
    gracePeriodMs = 30000,
  ) {
    this.gracePeriodMs = gracePeriodMs
    this.gitRepoPath = gitRepoPath
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    // lazyConnect: the client only connects on the first lock command
    // (auto-save tick); unit tests that never lock never dial Redis.
    const redis = new Redis(redisUrl, { lazyConnect: true })
    redis.on('error', (err: Error) => console.error('[YjsManager] redis error:', err.message))
    // Non-blocking lock on the SAME 'lock:file:<path>' key the backend uses.
    // Auto-save skips its tick when a backend git op holds the lock; it must
    // never wait, because /internal/flush and /internal/reload are called by
    // the backend WHILE it holds the lock (waiting would deadlock).
    this.tryLock = createTryFileLock(redis)
    console.log(`[YjsManager] Git repo path: ${this.gitRepoPath}`)
  }

  // Sidecar path: <filePath>.ydoc holds the binary Yjs update
  // (Y.encodeStateAsUpdate). Plain text loses Yjs item identities
  // (clientIDs/clocks): re-creating the Y.Doc from the text file alone gives
  // every item a NEW identity, so a reconnecting client that still holds the
  // OLD items merges them as concurrent insertions at position 0 and the
  // document doubles on every session re-creation. Restoring the update
  // preserves identities and makes the re-sync a no-op.
  private sidecarPath(filePath: string): string {
    return `${this.gitRepoPath}/${filePath}.ydoc`
  }

  private writeSidecar(session: DocumentSession): void {
    writeFileSync(this.sidecarPath(session.filePath), Y.encodeStateAsUpdate(session.ydoc))
  }

  // Diff-apply file content onto the session's Y.Text. Used by init (the
  // sidecar may be stale after an external git operation) and by reload
  // (the backend checked out a revision). Keeps item identities wherever
  // the text already matches.
  private applyFileContent(session: DocumentSession, newContent: string): void {
    const ytext = session.ydoc.getText('markdown')
    const currentContent = ytext.toString()
    if (newContent === currentContent) return

    const diff = fastDiff(currentContent, newContent)

    let offset = 0
    for (const [op, text] of diff) {
      if (op === fastDiff.DELETE) {
        ytext.delete(offset, text.length)
      } else if (op === fastDiff.INSERT) {
        ytext.insert(offset, text)
        offset += text.length
      } else if (op === fastDiff.EQUAL) {
        offset += text.length
      }
    }
  }

  // Initialize document from file
  initDocument(docId: string, filePath: string): DocumentSession {
    const fullPath = `${this.gitRepoPath}/${filePath}`

    // Create Y.Doc
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('markdown')

    // Load file content if exists
    let content = ''
    if (existsSync(fullPath)) {
      content = readFileSync(fullPath, 'utf8')
    }

    // Restore item identities from the sidecar when available; otherwise
    // seed the Y.Text with the file content (first session ever).
    const sidecar = this.sidecarPath(filePath)
    if (existsSync(sidecar)) {
      try {
        Y.applyUpdate(ydoc, readFileSync(sidecar))
      } catch (error) {
        console.error(`[YjsManager] Corrupt sidecar for ${docId}, re-seeding from file:`, error)
        ytext.insert(0, content)
      }
    } else {
      ytext.insert(0, content)
    }

    const session: DocumentSession = {
      ydoc,
      filePath,
      lastSave: Date.now(),
      connections: new Set()
    }

    this.documents.set(docId, session)

    // The .md file is the source of truth; converge the restored state to it
    // (e.g. the backend checked out a revision while no session was alive).
    this.applyFileContent(session, content)

    // Generation counter: bumped by reloadDocument when the backend resets
    // the file (discard/restore). Clients compare it after sync and drop
    // stale local state instead of merging it back (which would resurrect
    // deleted content). Persisted inside the sidecar update.
    const meta = session.ydoc.getMap('meta')
    if (meta.get('generation') === undefined) {
      meta.set('generation', 0)
    }

    console.log(`[YjsManager] Initialized document ${docId} from ${filePath} (text ${ytext.length} chars, gen ${meta.get('generation')}, conns ${session.connections.size})`)

    return session
  }
  
  // Get existing document session
  getDocument(docId: string): DocumentSession | undefined {
    return this.documents.get(docId)
  }
  
  // Add connection to document
  addConnection(docId: string, connectionId: string): void {
    const session = this.documents.get(docId)
    if (session) {
      session.connections.add(connectionId)
      this.scheduleAutoSave(docId)
    }
  }
  
  // Remove connection from document  
  removeConnection(docId: string, connectionId: string): void {
    const session = this.documents.get(docId)
    if (session) {
      session.connections.delete(connectionId)
      
      // If no more connections, stop auto-save and cleanup
      if (session.connections.size === 0) {
        this.stopAutoSave(docId)
        // Final flush before cleanup
        this.flushDocument(docId)
        console.log(`[YjsManager] Final flush on last disconnect for ${docId}`)
        // Keep document for a bit in case of reconnection
        setTimeout(() => {
          // Guard by session identity: a stale timer from a PREVIOUS session
          // must never delete the CURRENT session stored under the same
          // docId — that would silently drop live edits (observed as clients
          // reconnecting to stale content after ~30s).
          if (session.connections.size === 0 && this.documents.get(docId) === session) {
            this.documents.delete(docId)
            console.log(`[YjsManager] Cleaned up document ${docId}`)
          }
        }, this.gracePeriodMs) // grace period before the session is dropped
      }
    }
  }
  
  // Schedule auto-save for document
  private scheduleAutoSave(docId: string): void {
    const session = this.documents.get(docId)
    if (!session) return
    
    // Clear existing timer
    if (session.autoSaveTimer) {
      clearTimeout(session.autoSaveTimer)
    }
    
    // Schedule new auto-save
    session.autoSaveTimer = setTimeout(() => {
      this.autoSaveDocument(docId)
    }, this.autoSaveInterval)
  }
  
  // Auto-save document to working tree
  private async autoSaveDocument(docId: string): Promise<void> {
    const session = this.documents.get(docId)
    if (!session) return

    let releaser: FileLockReleaser | null = null
    try {
      // Skip this tick if a backend git operation holds the lock; the content
      // lives in the Yjs doc and will be written on the next tick.
      releaser = await this.tryLock(session.filePath)
      if (!releaser) {
        console.log(`[YjsManager] Auto-save skipped for ${docId} (lock held)`)
        return
      }
      this.flushDocument(docId)
      console.log(`[YjsManager] Auto-saved document ${docId} (${session.ydoc.getText('markdown').length} chars)`)
    } catch (error) {
      console.error(`[YjsManager] Auto-save failed for ${docId}:`, error)
    } finally {
      if (releaser) {
        try {
          await releaser()
        } catch {
          /* ignore release error */
        }
      }
      // Always reschedule while connections exist (previously a single failed
      // flush permanently stopped auto-save for the document).
      const current = this.documents.get(docId)
      if (current && current.connections.size > 0) {
        this.scheduleAutoSave(docId)
      }
    }
  }
  
  // Stop auto-save timer
  private stopAutoSave(docId: string): void {
    const session = this.documents.get(docId)
    if (session?.autoSaveTimer) {
      clearTimeout(session.autoSaveTimer)
      session.autoSaveTimer = undefined
    }
  }
  
  // Flush document to file (called by auto-save and /internal/flush)
  flushDocument(docId: string): void {
    const session = this.documents.get(docId)
    if (!session) {
      throw new Error(`Document ${docId} not found`)
    }

    const content = session.ydoc.getText('markdown').toString()
    const fullPath = `${this.gitRepoPath}/${session.filePath}`

    // Ensure directory exists
    mkdirSync(dirname(fullPath), { recursive: true })

    // Write file and the identity-preserving sidecar
    writeFileSync(fullPath, content, 'utf8')
    this.writeSidecar(session)
    session.lastSave = Date.now()
  }

  // Reload document from file (called by /internal/reload)
  reloadDocument(docId: string): void {
    const session = this.documents.get(docId)
    if (!session) {
      throw new Error(`Document ${docId} not found`)
    }

    const fullPath = `${this.gitRepoPath}/${session.filePath}`

    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${session.filePath}`)
    }

    const newContent = readFileSync(fullPath, 'utf8')
    const currentContent = session.ydoc.getText('markdown').toString()

    if (newContent === currentContent) {
      return // No changes
    }

    // Diff-apply the checked-out content, then persist the new identities
    // so a future session re-creation restores them instead of doubling.
    this.applyFileContent(session, newContent)
    // Bump the generation so connected/reconnecting clients reset their
    // local state instead of merging pre-reset items back.
    const meta = session.ydoc.getMap('meta')
    meta.set('generation', ((meta.get('generation') as number | undefined) ?? 0) + 1)
    this.writeSidecar(session)

    console.log(`[YjsManager] Reloaded document ${docId} from file`)
  }
}