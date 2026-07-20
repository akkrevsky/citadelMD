import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view' 
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import * as Y from 'yjs'
import { yCollab } from 'y-codemirror.next'
import { WebsocketProvider } from 'y-websocket'

interface CollaborativeEditorProps {
  documentId: string
  initialContent?: string
  readOnly?: boolean
  shareToken?: string
  onContentChange?: (content: string) => void
}

export function CollaborativeEditor({ 
  documentId, 
  initialContent = '', 
  readOnly = false,
  shareToken,
  onContentChange 
}: CollaborativeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!editorRef.current) return
    
    // Create Y.Doc
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('markdown')
    
    // Initialize with content if provided and text is empty
    if (initialContent && ytext.length === 0) {
      ytext.insert(0, initialContent)
    }
    
    // Setup WebSocket provider through nginx proxy
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/socket`
    const docId = `doc-${documentId}`
    
    const provider = new WebsocketProvider(wsUrl, docId, ydoc, {
      params: {
        ...(shareToken ? { token: shareToken } : {})
      }
    })
    
    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected')
      if (event.status === 'connected') {
        setError(null)
      }
    })
    
    provider.on('connection-error', (error: Error) => {
      setError(`Connection failed: ${error.message}`)
      setIsConnected(false)
    })
    
    // Create basic extensions array
    const extensions = [
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ]),
      markdown(),
      oneDark,
      yCollab(ytext, provider.awareness, { 
        undoManager: new Y.UndoManager(ytext)
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onContentChange) {
          onContentChange(update.state.doc.toString())
        }
      }),
      EditorState.readOnly.of(readOnly)
    ]
    
    // Create editor state with Yjs collaboration
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions
    })
    
    // Create editor view
    const view = new EditorView({
      state,
      parent: editorRef.current
    })
    
    viewRef.current = view
    
    // Cleanup
    return () => {
      provider.destroy()
      view.destroy()
    }
  }, [documentId, initialContent, readOnly, shareToken, onContentChange])
  
  return (
    <div className="collaborative-editor">
      <div className="editor-status">
        {isConnected ? (
          <span className="status-connected">Connected</span>
        ) : (
          <span className="status-disconnected">Disconnected</span>
        )}
        {error && (
          <span className="status-error">Warning: {error}</span>
        )}
      </div>
      <div 
        ref={editorRef} 
        className="editor-container"
        style={{
          border: '1px solid #ccc',
          borderRadius: '4px',
          minHeight: '400px'
        }}
      />
    </div>
  )
}