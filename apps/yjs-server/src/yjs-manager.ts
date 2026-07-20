import * as Y from 'yjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname } from 'path'
import { mkdirSync } from 'fs'
import fastDiff from 'fast-diff'

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
  private readonly autoSaveInterval = 5000 // 5 seconds

  constructor(gitRepoPath = process.env.GIT_REPO_PATH || '/var/lib/md-collab/docs') {
    this.gitRepoPath = gitRepoPath
    console.log(`[YjsManager] Git repo path: ${this.gitRepoPath}`)
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
    
    // Initialize Y.Text with file content
    ytext.insert(0, content)
    
    const session: DocumentSession = {
      ydoc,
      filePath,
      lastSave: Date.now(),
      connections: new Set()
    }
    
    this.documents.set(docId, session)
    console.log(`[YjsManager] Initialized document ${docId} from ${filePath}`)
    
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
        // Keep document for a bit in case of reconnection
        setTimeout(() => {
          if (session.connections.size === 0) {
            this.documents.delete(docId)
            console.log(`[YjsManager] Cleaned up document ${docId}`)
          }
        }, 30000) // 30 second grace period
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
  private autoSaveDocument(docId: string): void {
    const session = this.documents.get(docId)
    if (!session) return
    
    try {
      this.flushDocument(docId)
      console.log(`[YjsManager] Auto-saved document ${docId}`)
      
      // Reschedule if connections still exist
      if (session.connections.size > 0) {
        this.scheduleAutoSave(docId)
      }
    } catch (error) {
      console.error(`[YjsManager] Auto-save failed for ${docId}:`, error)
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
    
    // Write file
    writeFileSync(fullPath, content, 'utf8')
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
    
    // Calculate diff and apply changes
    const diff = fastDiff(currentContent, newContent)
    const ytext = session.ydoc.getText('markdown')
    
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
    
    console.log(`[YjsManager] Reloaded document ${docId} from file`)
  }
}