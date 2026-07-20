import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor.js'
import { MarkdownPreview } from '../components/MarkdownPreview.js'
import { EditorToolbar, type ViewMode } from '../components/EditorToolbar.js'
import { StatusBar } from '../components/StatusBar.js'
import { TabBar } from '../components/TabBar.js'
import { UploadIndicator } from '../components/UploadIndicator.js'
import { useFileUpload } from '../hooks/useFileUpload.js'
import { useTheme } from '../hooks/useTheme'
import { api, type Document } from '../api-client.js'
import '../styles/editor.css'
import '../styles/preview.css'
import '../styles/toolbar.css'
import '../styles/statusbar.css'
import '../styles/tabbar.css'

const ExcalidrawEditor = React.lazy(() => import('../components/ExcalidrawEditor.js'))

export function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [doc, setDoc] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showExcalidraw, setShowExcalidraw] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isConnected, setIsConnected] = useState(false)

  // Document stats
  const [stats, setStats] = useState({ words: 0, chars: 0, lines: 0 })
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Preview content - debounced to avoid re-render on every keystroke
  const [previewContent, setPreviewContent] = useState('')
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  function handleInsertAtCursor(text: string): void {
    window.document.dispatchEvent(new CustomEvent('insert-at-cursor', { detail: { text } }))
  }

  const { uploadState, handlePaste, handleDrop, handleDragOver, uploadFile } = useFileUpload({
    documentId: id!,
    onInsert: handleInsertAtCursor,
  })

  useEffect(() => {
    if (!id) {
      navigate('/dashboard')
      return
    }

    loadDocument()
  }, [id, navigate])

  const loadDocument = async () => {
    try {
      setLoading(true)

      const docResponse = await api.getDocument(id!)
      setDoc(docResponse)

      const contentResponse = await api.exportDocument(id!)
      setContent(contentResponse)

    } catch (error) {
      console.error('Failed to load document:', error)
      setError('Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  // Track content changes for save detection and preview
  const contentRef = useRef(content)
  const handleContentChange = useCallback((newContent: string) => {
    contentRef.current = newContent
    if (contentRef.current !== content) {
      setHasChanges(true)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Debounce preview update (300ms) to avoid re-render on every keystroke
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      setPreviewContent(newContent)
    }, 300)
  }, [content])

  const handleFormat = useCallback((type: string) => {
    // Simple format insertions (will be refined with actual CM6 commands later)
    switch (type) {
      case 'undo':
        handleInsertAtCursor('__undo__')
        break
      case 'redo':
        handleInsertAtCursor('__redo__')
        break
      case 'bold':
        handleInsertAtCursor('**bold text**')
        break
      case 'italic':
        handleInsertAtCursor('*italic text*')
        break
      case 'strikethrough':
        handleInsertAtCursor('~~strikethrough~~')
        break
      case 'h1':
        handleInsertAtCursor('# Heading 1\n\n')
        break
      case 'h2':
        handleInsertAtCursor('## Heading 2\n\n')
        break
      case 'h3':
        handleInsertAtCursor('### Heading 3\n\n')
        break
      case 'code':
        handleInsertAtCursor('`code`')
        break
      case 'quote':
        handleInsertAtCursor('> quote\n\n')
        break
      case 'ul':
        handleInsertAtCursor('- item\n- item\n- item\n\n')
        break
      case 'ol':
        handleInsertAtCursor('1. item\n2. item\n3. item\n\n')
        break
      case 'task':
        handleInsertAtCursor('- [ ] task\n- [ ] task\n- [ ] task\n\n')
        break
      case 'link':
        handleInsertAtCursor('[link text](https://)')
        break
      case 'image':
        handleInsertAtCursor('![alt text](https://)')
        break
      case 'table':
        handleInsertAtCursor('| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n\n')
        break
      case 'hr':
        handleInsertAtCursor('\n---\n\n')
        break
    }
  }, [handleInsertAtCursor])

  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorPos({ line, col })
  }, [])

  const handleDocStats = useCallback((s: { words: number; chars: number; lines: number }) => {
    setStats(s)
  }, [])

  const handleExcalidrawSave = (svgDataUrl: string) => {
    const insertText = '```excalidraw\n' + svgDataUrl + '\n```\n\n'
    handleInsertAtCursor(insertText)
    setShowExcalidraw(false)
  }

  const handleSave = async () => {
    try {
      setIsCommitting(true)
      await api.commitDocument(id!, 'Auto-save')
      setHasChanges(false)
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsCommitting(false)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      alert('Please enter a commit message')
      return
    }

    try {
      setIsCommitting(true)
      await api.commitDocument(id!, commitMessage)
      setCommitMessage('')
      setHasChanges(false)
      alert('Changes committed successfully!')
    } catch (error) {
      console.error('Commit failed:', error)
      if (error instanceof Error) {
        alert('Commit failed: ' + error.message)
      }
    } finally {
      setIsCommitting(false)
    }
  }

  const handleDiscard = async () => {
    if (!confirm('Are you sure you want to discard all changes?')) {
      return
    }

    try {
      setIsDiscarding(true)
      await api.discardDocument(id!)
      setHasChanges(false)
      alert('Changes discarded successfully!')
      await loadDocument()
    } catch (error) {
      console.error('Discard failed:', error)
      if (error instanceof Error) {
        alert('Discard failed: ' + error.message)
      }
    } finally {
      setIsDiscarding(false)
    }
  }

  if (loading) {
    return (
      <div className="document-edit-page">
        <div className="loading">Loading document...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="document-edit-page">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="document-edit-page">
        <div className="error">Document not found</div>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    )
  }

  const readTime = Math.max(1, Math.round(stats.words / 200))

  return (
    <div
      className="document-edit-page"
      onPaste={handlePaste as unknown as React.ClipboardEventHandler}
      onDrop={handleDrop as unknown as React.DragEventHandler}
      onDragOver={handleDragOver as unknown as React.DragEventHandler}
    >
      {/* Header with document info and commit controls */}
      <div className="document-header">
        <div className="document-info">
          <h1>{doc.title}</h1>
          <span className="document-path">{doc.filePath}</span>
        </div>

        <div className="document-actions">
          {hasChanges && (
            <span className="changes-indicator">Unsaved changes</span>
          )}

          <button
            onClick={handleSave}
            disabled={!hasChanges || isCommitting}
            className="btn btn-sm btn-primary"
          >
            {isCommitting ? 'Saving...' : 'Save'}
          </button>

          <div className="commit-section">
            <input
              type="text"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isCommitting}
            />
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || isCommitting}
            >
              {isCommitting ? 'Committing...' : 'Commit'}
            </button>
          </div>

          <button
            onClick={handleDiscard}
            disabled={isDiscarding || !hasChanges}
            className="discard-button"
          >
            {isDiscarding ? 'Discarding...' : 'Discard'}
          </button>

          <button onClick={() => navigate('/')}>
            Dashboard
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={[{ id: id!, label: doc.title, path: doc.filePath }]}
        activeTabId={id!}
        onTabSelect={() => {}}
        onTabClose={() => navigate('/dashboard')}
      />

      {/* Editor toolbar */}
      <EditorToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onFormat={handleFormat}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Attach file button bar */}
      <div className="editor-toolbar" style={{ borderTop: 'none', paddingTop: 0, paddingBottom: '4px' }}>
        <UploadIndicator {...uploadState} />
        <div className="toolbar-group">
          <button
            className="toolbar-btn text-btn"
            onClick={() => window.document.getElementById('file-input')?.click()}
            title="Attach file"
          >
            Attach File
          </button>
          <input
            id="file-input"
            type="file"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await uploadFile(file)
              e.target.value = ''
            }}
            accept="image/*,.pdf,.txt,.md"
          />
          <button
            className="toolbar-btn text-btn"
            onClick={() => setShowExcalidraw(true)}
            title="Draw diagram"
          >
            Draw Diagram
          </button>
        </div>
      </div>

      {/* Editor section */}
      <div className="editor-section">
        {viewMode === 'source' && (
          <div className="code-editor-pane full-width">
            <CollaborativeEditor
              documentId={id!}
              initialContent={content}
              onContentChange={handleContentChange}
              onCursorChange={handleCursorChange}
              onDocStats={handleDocStats}
              onConnectionChange={(status) => {
                setIsConnected(status === 'connected')
              }}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="editor-with-preview">
            <div className="code-editor-pane">
              <CollaborativeEditor
                documentId={id!}
                initialContent={content}
                onContentChange={handleContentChange}
                onCursorChange={handleCursorChange}
                onDocStats={handleDocStats}
                onConnectionChange={(status) => {
                  setIsConnected(status === 'connected')
                }}
              />
            </div>
            <div className="preview-pane">
              <div className="preview-wrapper">
                <MarkdownPreview content={previewContent || content} />
              </div>
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="preview-pane full-width">
            <div className="preview-wrapper">
              <MarkdownPreview content={content} />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        words={stats.words}
        chars={stats.chars}
        lines={stats.lines}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        fileName={doc.title + '.md'}
        isConnected={isConnected}
        connectionStatus={isConnected ? 'connected' : 'disconnected'}
        readTime={readTime}
      />

      {/* Excalidraw modal */}
      {showExcalidraw && (
        <div className="modal-overlay" onClick={() => setShowExcalidraw(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading diagram editor...</div>}>
              <ExcalidrawEditor
                onSave={handleExcalidrawSave}
                onClose={() => setShowExcalidraw(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}
