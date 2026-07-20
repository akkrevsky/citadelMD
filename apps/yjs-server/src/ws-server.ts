import { WebSocketServer, WebSocket } from 'ws'
import type { RawData } from 'ws'
import * as Y from 'yjs'
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

  constructor(port = 1234) {
    this.yjsManager = new YjsManager()
    this.wss = new WebSocketServer({ port })
    this.setupWebSocketServer()
    console.log(`[YjsWS] WebSocket server started on port ${port}`)
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, request) => {
      const url = new URL(request.url!, `http://localhost`)
      const docId = url.searchParams.get('docid')
      const token = url.searchParams.get('token')
      
      if (!docId) {
        ws.close(1000, 'Missing docid parameter')
        return
      }

      // TODO: Validate JWT token in Phase 3+
      // For now, accept all connections
      
      const connectionId = this.generateConnectionId()
      const connectionInfo: ConnectionInfo = {
        ws,
        docId,
        connectionId
      }
      
      this.connections.set(connectionId, connectionInfo)
      
      // Initialize or get document session
      let session = this.yjsManager.getDocument(docId)
      if (!session) {
        // Extract filePath from docId (format: doc-{uuid})
        // We'll need to query backend for filePath
        // For now, assume it matches document ID
        const filePath = `${docId.replace('doc-', '')}.md`
        session = this.yjsManager.initDocument(docId, filePath)
      }
      
      this.yjsManager.addConnection(docId, connectionId)
      
      // Send initial document state
      const update = Y.encodeStateAsUpdate(session.ydoc)
      ws.send(update)
      
      // Setup message handler for Yjs updates
      ws.on('message', (data: RawData) => {
        this.handleYjsUpdate(connectionId, data)
      })
      
      // Setup close handler
      ws.on('close', () => {
        this.handleDisconnection(connectionId)
      })
      
      console.log(`[YjsWS] Client connected: ${connectionId} for document ${docId}`)
    })
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
    for (const [connId, connection] of this.connections) {
      if (connId !== excludeConnectionId && 
          connection.docId === docId && 
          connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(update)
      }
    }
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
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2)}`
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