import { WebSocketServer, WebSocket } from 'ws'
import type { RawData } from 'ws'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import { randomUUID } from 'crypto'
import { YjsManager } from './yjs-manager.js'

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://backend:3000'

// y-websocket protocol message types (see yjs/y-websocket).
// Each WS frame is: [messageType, ...payload].
//   messageType 0 = sync:    [0, syncSubType, ...syncPayload]
//   messageType 1 = awareness
const messageSync = 0
const messageAwareness = 1

/** Convert a ws RawData frame into a Uint8Array for lib0/Yjs. */
function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (Array.isArray(data)) {
    const buf = Buffer.concat(data)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  const buf = data as ArrayBuffer
  return new Uint8Array(buf)
}

export interface ConnectionInfo {
  ws: WebSocket
  docId: string
  userId?: string
  connectionId: string
  permission?: 'READ' | 'WRITE'
}

interface WsAuthResult {
  permission: NonNullable<ConnectionInfo['permission']>
  filePath: string
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
        // Also support path-based room names from y-websocket: /socket/roomName
        const pathParts = url.pathname.split('/').filter(Boolean)
        const pathDocId = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null
        const effectiveDocId = docId || (pathDocId && pathDocId.startsWith('doc-') ? pathDocId : null)
        const token = url.searchParams.get('token')
        
        // Validate docId parameter
        if (!effectiveDocId) {
          ws.close(1000, 'Missing docid parameter')
          return
        }

        // Basic docId format validation (prevent path traversal, etc.)
        if (!/^[a-zA-Z0-9_-]+$/.test(effectiveDocId)) {
          ws.close(1003, 'Invalid docid format')
          return
        }

        // Authorization: a share token (guest) OR an authenticated session
        // cookie (browser user). Connections with neither (or an invalid one)
        // are rejected below - this closes the previous anonymous-write hole.
        const permissionPromise = token
          ? this.validateShareToken(token)
          : this.validateSession(request.headers.cookie, effectiveDocId)

        permissionPromise.then((auth) => {
          if (!auth) {
            ws.close(1008, 'Authentication required')
            return
          }

          const { permission, filePath } = auth
          if (permission === 'READ' || permission === 'WRITE') {
            console.log(`[YjsWS] Connection with ${permission} permission for document ${effectiveDocId}`)
          }
          
          const connectionId = this.generateConnectionId()
          const connectionInfo: ConnectionInfo = {
            ws,
            docId: effectiveDocId,
            connectionId,
            permission
          }
          
          this.connections.set(connectionId, connectionInfo)
          
          // Initialize or get document session with atomic lock
          this.initializeDocumentSession(effectiveDocId, connectionId, filePath)
            .then(() => {
              // Send initial document state with error handling
              const session = this.yjsManager.getDocument(effectiveDocId)
              if (session && ws.readyState === WebSocket.OPEN) {
                try {
                  // Start the y-websocket sync handshake: send sync step1
                  // (state-vector request) so the client replies with its
                  // missing updates. The client also sends its own step1,
                  // which we answer with step2 (server state) in
                  // handleYjsUpdate. Both directions use the standard
                  // [messageSync, ...syncProtocol] framing.
                  const encoder = encoding.createEncoder()
                  encoding.writeVarUint(encoder, messageSync)
                  syncProtocol.writeSyncStep1(encoder, session.ydoc)
                  ws.send(encoding.toUint8Array(encoder))
                } catch (error) {
                  console.error(`[YjsWS] Error sending initial state to ${connectionId}:`, error)
                  ws.close(1011, 'Server error sending initial state')
                  return
                }
              }
              
              console.log(`[YjsWS] Client connected: ${connectionId} for document ${effectiveDocId}`)
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
        }).catch((error) => {
          console.error(`[YjsWS] Token validation failed:`, error)
          ws.close(1008, 'Invalid or expired share token')
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
  
  private async initializeDocumentSession(docId: string, connectionId: string, filePath: string): Promise<void> {
    // Check if there's already an initialization in progress
    const existingLock = this.documentInitLocks.get(docId)
    if (existingLock) {
      await existingLock
      this.yjsManager.addConnection(docId, connectionId)
      return
    }

    // Create initialization promise to prevent race conditions
    const initPromise = this.performDocumentInitialization(docId, connectionId, filePath)
    this.documentInitLocks.set(docId, initPromise)

    try {
      await initPromise
    } finally {
      // Remove lock after initialization completes or fails
      this.documentInitLocks.delete(docId)
    }
  }

  private async performDocumentInitialization(
    docId: string,
    connectionId: string,
    filePath: string,
  ): Promise<void> {
    let session = this.yjsManager.getDocument(docId)
    if (!session) {
      session = this.yjsManager.initDocument(docId, filePath)
    }
    
    this.yjsManager.addConnection(docId, connectionId)
  }
  
  private handleYjsUpdate(connectionId: string, data: RawData): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    const session = this.yjsManager.getDocument(connection.docId)
    if (!session) return

    const uint8 = toUint8Array(data)

    try {
      const decoder = decoding.createDecoder(uint8)
      const messageType = decoding.readVarUint(decoder)
      if (process.env.YJS_DEBUG) {
        console.log(`[YjsWS:debug] msg type=${messageType} len=${uint8.length}`)
      }

      if (messageType === messageSync) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        if (connection.permission === 'READ') {
          // Guests: only answer state-vector requests (step1); never apply
          // incoming edits (step2/update) so a read-only client cannot mutate
          // the shared document.
          if (decoding.peekVarUint(decoder) === syncProtocol.messageYjsSyncStep1) {
            syncProtocol.readSyncMessage(decoder, encoder, session.ydoc, null)
            if (encoding.length(encoder) > 1) {
              this.send(connection.ws, encoding.toUint8Array(encoder))
            }
          }
        } else {
          // WRITE: apply edits, answer step1 with step2, broadcast updates.
          const subType = syncProtocol.readSyncMessage(
            decoder,
            encoder,
            session.ydoc,
            connectionId,
          )
          if (encoding.length(encoder) > 1) {
            this.send(connection.ws, encoding.toUint8Array(encoder))
          }
          if (
            subType === syncProtocol.messageYjsSyncStep2 ||
            subType === syncProtocol.messageYjsUpdate
          ) {
            this.broadcastRaw(connection.docId, uint8, connectionId)
          }
        }
      } else if (messageType === messageAwareness) {
        // Forward awareness (cursor/presence) to other clients verbatim.
        this.broadcastRaw(connection.docId, uint8, connectionId)
      }
      // Unknown message types are ignored.
    } catch (error) {
      console.error(`[YjsWS] Error handling message from ${connectionId}:`, error)
    }
  }

  /** Send raw bytes to a single open WebSocket. */
  private send(ws: WebSocket, payload: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload)
      } catch (error) {
        console.error('[YjsWS] Error sending payload:', error)
      }
    }
  }

  /** Broadcast a pre-framed message to all connections on a doc except one. */
  private broadcastRaw(docId: string, payload: Uint8Array, excludeConnectionId: string): void {
    this.connections.forEach((connection, connId) => {
      if (
        connId !== excludeConnectionId &&
        connection.docId === docId
      ) {
        this.send(connection.ws, payload)
      }
    })
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
  
  private async validateShareToken(token: string): Promise<WsAuthResult | undefined> {
    try {
      const url = `${BACKEND_API_URL}/api/shares/${encodeURIComponent(token)}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      
      if (!response.ok) {
        console.warn(`[YjsWS] Share token validation failed with status ${response.status}`)
        return undefined
      }
      
      const body = await response.json() as {
        share?: { permission?: string; document?: { filePath?: string } }
      }
      const permission = body?.share?.permission
      const filePath = body?.share?.document?.filePath
      
      if (permission !== 'READ' && permission !== 'WRITE') {
        console.warn(`[YjsWS] Unknown permission from share token: ${permission}`)
        return undefined
      }
      if (!filePath) {
        console.warn('[YjsWS] Share token response missing document filePath')
        return undefined
      }
      
      return { permission: permission as WsAuthResult['permission'], filePath }
    } catch (error) {
      console.error(`[YjsWS] Error validating share token:`, error)
      return undefined
    }
  }

  /**
   * Validate an authenticated browser session by forwarding the cookie to the
   * backend's /api/documents/:id/ws-permission endpoint. Returns the user's
   * effective WS permission on the document (READ for VIEW, WRITE for
   * EDIT/ADMIN), or null if unauthenticated / no access.
   */
  private async validateSession(
    cookie: string | undefined,
    docId: string
  ): Promise<WsAuthResult | null> {
    if (!cookie) return null
    // docId is 'doc-<uuid>'; the backend document id is the bare uuid
    const docUuid = docId.startsWith('doc-') ? docId.slice(4) : docId
    try {
      const url = `${BACKEND_API_URL}/api/documents/${encodeURIComponent(docUuid)}/ws-permission`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(url, { headers: { cookie }, signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) return null
      const body = (await response.json()) as { permission?: string; filePath?: string }
      if (!body.filePath) return null
      if (body.permission === 'EDIT') return { permission: 'WRITE', filePath: body.filePath }
      if (body.permission === 'VIEW') return { permission: 'READ', filePath: body.filePath }
      return null
    } catch (error) {
      console.error('[YjsWS] Error validating session:', error)
      return null
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