import { WebSocketServer, WebSocket } from 'ws'
import type { RawData } from 'ws'
import * as Y from 'yjs'
import { randomUUID } from 'crypto'
import { YjsManager } from './yjs-manager.js'

export interface ConnectionInfo {
  ws: WebSocket
  docId: string
  userId?: string
  connectionId: string
}

export class YjsWebSocketServer {
  private wss: WebSocketServer
  private yjsManager: YjsManager
  private connections = new Map<string, ConnectionInfo>()
  private documentInitLocks = new Map<string, Promise<any>>()

  constructor(port = 1234) {
    this.yjsManager = new YjsManager()
    this.wss = new WebSocketServer({ port })
    this.setupWebSocketServer()
    console.log(`[YjsWS] WebSocket server started on port ${port}`)
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, request) => {
      try {
        // Validate request URL exists
        if (!request.url) {
          ws.close(1003, 'Invalid request: missing URL')
          return
        }

        const url = new URL(request.url, `http://localhost`)
        const docId = url.searchParams.get('docid')
        const token = url.searchParams.get('token')
        
        // Validate docId parameter
        if (!docId) {
          ws.close(1000, 'Missing docid parameter')
          return
        }

        // Basic docId format validation (prevent path traversal, etc.)
        if (!/^[a-zA-Z0-9_-]+$/.test(docId)) {
          ws.close(1003, 'Invalid docid format')
          return
        }

        // TODO: Validate JWT token in Phase 3+
        // For now, accept all connections with valid docId format
        
        const connectionId = this.generateConnectionId()
        const connectionInfo: ConnectionInfo = {
          ws,
          docId,
          connectionId
        }
        
        this.connections.set(connectionId, connectionInfo)
        
        // Initialize or get document session with atomic lock
        this.initializeDocumentSession(docId, connectionId)
          .then(() => {
            // Send initial document state with error handling
            const session = this.yjsManager.getDocument(docId)
            if (session && ws.readyState === WebSocket.OPEN) {
              try {
                const update = Y.encodeStateAsUpdate(session.ydoc)
                ws.send(update)
              } catch (error) {
                console.error(`[YjsWS] Error sending initial state to ${connectionId}:`, error)
                ws.close(1011, 'Server error sending initial state')
                return
              }
            }
            
            console.log(`[YjsWS] Client connected: ${connectionId} for document ${docId}`)
          })
          .catch((error) => {
            console.error(`[YjsWS] Error initializing document session:`, error)
            ws.close(1011, 'Server error initializing document')
            this.connections.delete(connectionId)
          })
        
        // Setup message handler for Yjs updates
        ws.on('message', (data: RawData) => {
          this.handleYjsUpdate(connectionId, data)
        })
        
        // Setup close handler
        ws.on('close', () => {
          this.handleDisconnection(connectionId)
        })
        
        // Setup error handler
        ws.on('error', (error) => {
          console.error(`[YjsWS] WebSocket error for ${connectionId}:`, error)
          this.handleDisconnection(connectionId)
        })
        
      } catch (error) {
        console.error(`[YjsWS] Error handling connection:`, error)
        try {
          ws.close(1011, 'Server error processing connection')
        } catch (closeError) {
          console.error(`[YjsWS] Error closing WebSocket:`, closeError)
        }
      }
    })
  }
  
  private async initializeDocumentSession(docId: string, connectionId: string): Promise<void> {
    // Check if there's already an initialization in progress
    const existingLock = this.documentInitLocks.get(docId)
    if (existingLock) {
      await existingLock
      this.yjsManager.addConnection(docId, connectionId)
      return
    }

    // Create initialization promise to prevent race conditions
    const initPromise = this.performDocumentInitialization(docId, connectionId)
    this.documentInitLocks.set(docId, initPromise)

    try {
      await initPromise
    } finally {
      // Remove lock after initialization completes or fails
      this.documentInitLocks.delete(docId)
    }
  }

  private async performDocumentInitialization(docId: string, connectionId: string): Promise<void> {
    let session = this.yjsManager.getDocument(docId)
    if (!session) {
      // Generate more robust filePath from docId
      let filePath: string
      if (docId.startsWith('doc-')) {
        // Extract UUID and create .md file
        const uuid = docId.replace('doc-', '')
        filePath = `${uuid}.md`
      } else {
        // Fallback: sanitize docId as filename
        const sanitizedDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_')
        filePath = `${sanitizedDocId}.md`
      }
      
      session = this.yjsManager.initDocument(docId, filePath)
    }
    
    this.yjsManager.addConnection(docId, connectionId)
  }
  
  private handleYjsUpdate(connectionId: string, data: RawData): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return
    
    const session = this.yjsManager.getDocument(connection.docId)
    if (!session) return
    
    try {
      // Convert RawData to Uint8Array for Yjs
      const updateArray = data instanceof Buffer ? 
        new Uint8Array(data) : 
        new Uint8Array(data as ArrayBuffer)
      
      // Apply update to Y.Doc
      Y.applyUpdate(session.ydoc, updateArray)
      
      // Broadcast update to other connections for same document
      this.broadcastUpdate(connection.docId, data, connectionId)
      
    } catch (error) {
      console.error(`[YjsWS] Error applying update:`, error)
    }
  }
  
  private broadcastUpdate(docId: string, update: RawData, excludeConnectionId: string): void {
    this.connections.forEach((connection, connId) => {
      if (connId !== excludeConnectionId && 
          connection.docId === docId && 
          connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(update)
        } catch (error) {
          console.error(`[YjsWS] Error broadcasting update to ${connId}:`, error)
          // Remove failed connection
          this.handleDisconnection(connId)
        }
      }
    })
  }
  
  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (connection) {
      this.yjsManager.removeConnection(connection.docId, connectionId)
      this.connections.delete(connectionId)
      console.log(`[YjsWS] Client disconnected: ${connectionId}`)
    }
  }
  
  private generateConnectionId(): string {
    return `conn_${randomUUID()}`
  }
  
  // Method for internal endpoints
  getYjsManager(): YjsManager {
    return this.yjsManager
  }
  
  // Check if document has active connections
  hasActiveConnections(docId: string): boolean {
    const session = this.yjsManager.getDocument(docId)
    return session ? session.connections.size > 0 : false
  }
}