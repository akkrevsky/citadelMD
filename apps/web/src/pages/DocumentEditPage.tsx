import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor.js'
import { MarkdownPreview } from '../components/MarkdownPreview.js'
import { EditorToolbar, type ViewMode } from '../components/EditorToolbar.js'
import { StatusBar } from '../components/StatusBar.js'
import { TabBar } from '../components/TabBar.js'
import { UploadIndicator } from '../components/UploadIndicator.js'
import { ShareDialog } from '../components/ShareDialog.js'
import { ToastContainer, createToast, type ToastData } from '../components/Toast.js'
import { ConfirmModal } from '../components/ConfirmModal.js'
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
  const [editedTitle, setEditedTitle] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showExcalidraw, setShowExcalidraw] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isConnected, setIsConnected] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(0)

  // Document stats
  const [stats, setStats] = useState({ words: 0, chars: 0, lines: 0 })
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [splitRatio, setSplitRatio] = useState(0.5)
  const resizeRef = useRef<{ dragging: boolean; startX: number; startRatio: number }>({ dragging: false, startX: 0, startRatio: 0.5 })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Preview content - debounced to avoid re-render on every keystroke
  const [previewContent, setPreviewContent] = useState('')
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleInsertAtCursor = useCallback((text: string) => {
    window.document.dispatchEvent(new CustomEvent('format-command', { detail: { action: 'insert', placeholder: text } }))
  }, [])

  const { uploadState, handlePaste, handleDrop, handleDragOver, uploadFile } = useFileUpload({
    documentId: id!,
    onInsert: handleInsertAtCursor,
  })

  useEffect(() => {
    if (!id) {
      navigate('/')
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
    const detail: Record<string, unknown> = {}
    switch (type) {
      case 'undo':
      case 'redo':
      case 'find':
        detail.action = type
        break
      case 'bold':
        detail.action = 'wrap'; detail.wrapper = '**'; detail.placeholder = 'bold text'
        break
      case 'italic':
        detail.action = 'wrap'; detail.wrapper = '*'; detail.placeholder = 'italic text'
        break
      case 'strikethrough':
        detail.action = 'wrap'; detail.wrapper = '~~'; detail.placeholder = 'strikethrough'
        break
      case 'code':
        detail.action = 'wrap'; detail.wrapper = '`'; detail.placeholder = 'code'
        break
      case 'h1':
        detail.action = 'prefix'; detail.prefix = '# '; detail.placeholder = 'Heading 1'
        break
      case 'h2':
        detail.action = 'prefix'; detail.prefix = '## '; detail.placeholder = 'Heading 2'
        break
      case 'h3':
        detail.action = 'prefix'; detail.prefix = '### '; detail.placeholder = 'Heading 3'
        break
      case 'quote':
        detail.action = 'prefix'; detail.prefix = '> '; detail.placeholder = 'quote'
        break
      case 'ul':
        detail.action = 'prefix'; detail.prefix = '- '; detail.placeholder = 'item'
        break
      case 'ol':
        detail.action = 'prefix'; detail.prefix = '1. '; detail.placeholder = 'item'
        break
      case 'task':
        detail.action = 'prefix'; detail.prefix = '- [ ] '; detail.placeholder = 'task'
        break
      case 'link':
        detail.action = 'wrap'; detail.wrapper = {'left':'[', 'right':'](https://)'}; detail.placeholder = 'link text'
        break
      case 'image':
        detail.action = 'wrap'; detail.wrapper = {'left':'![', 'right':'](https://)'}; detail.placeholder = 'alt text'
        break
      case 'table':
        detail.action = 'insert'
        detail.placeholder = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n\n'
        break
      case 'hr':
        detail.action = 'insert'
        detail.placeholder = '\n---\n\n'
        break
    }
    window.document.dispatchEvent(new CustomEvent('format-command', { detail }))
  }, [])

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
      createToast(setToasts, 'Please enter a commit message', 'error')
      return
    }

    try {
      setIsCommitting(true)
      await api.commitDocument(id!, commitMessage)
      setCommitMessage('')
      setHasChanges(false)
      createToast(setToasts, 'Changes committed successfully!', 'success')
    } catch (error) {
      console.error('Commit failed:', error)
      createToast(setToasts, 'Commit failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleDiscard = async () => {
    setShowDiscardConfirm(true)
  }

  const confirmDiscard = async () => {
    setShowDiscardConfirm(false)
    try {
      setIsDiscarding(true)
      await api.discardDocument(id!)
      setHasChanges(false)
      createToast(setToasts, 'Changes discarded', 'info')
      await loadDocument()
    } catch (error) {
      console.error('Discard failed:', error)
      createToast(setToasts, 'Discard failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error')
    } finally {
      setIsDiscarding(false)
    }
  }

  // Initialize editedTitle when doc loads and keep in sync
  useEffect(() => {
    if (doc) setEditedTitle(doc.title)
  }, [doc])

  // Save title on blur
  async function handleTitleBlur() {
    if (doc && editedTitle !== doc.title && editedTitle.trim()) {
      try {
        await api.updateDocument(id!, { title: editedTitle.trim() })
        setDoc({ ...doc, title: editedTitle.trim() })
      } catch {
        setEditedTitle(doc.title) // revert on error
      }
    }
  }

  // Resize handle drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current.dragging) return
      const container = document.querySelector('.editor-with-preview')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newRatio = (e.clientX - rect.left) / rect.width
      const clamped = Math.max(0.2, Math.min(0.8, newRatio))
      setSplitRatio(clamped)
    }
    function onMouseUp() {
      resizeRef.current.dragging = false
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // App-level keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      if (e.key === 's') {
        e.preventDefault()
        if (hasChanges) handleSave()
      } else if (e.key === 'h') {
        e.preventDefault()
        window.document.dispatchEvent(new CustomEvent('format-command', { detail: { action: 'find' } }))
      } else if (e.key === 'e') {
        e.preventDefault()
        const cycle: ViewMode[] = ['source', 'split', 'preview']
        const idx = cycle.indexOf(viewMode)
        setViewMode(cycle[(idx + 1) % cycle.length])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, hasChanges, handleSave])

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
        <button onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="document-edit-page">
        <div className="error">Document not found</div>
        <button onClick={() => navigate('/')}>Back to Dashboard</button>
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
          <input
            className="document-title-input"
            value={editedTitle || doc.title}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Document title"
          />
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

          <button onClick={() => setShowShareDialog(true)}>
            Share
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
        onTabClose={() => navigate('/')}
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
              onScrollRatio={setScrollRatio}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="editor-with-preview">
            <div className="code-editor-pane" style={{ flex: `0 0 ${splitRatio * 100}%` }}>
              <CollaborativeEditor
                documentId={id!}
                initialContent={content}
                onContentChange={handleContentChange}
                onCursorChange={handleCursorChange}
                onDocStats={handleDocStats}
                onConnectionChange={(status) => {
                  setIsConnected(status === 'connected')
                }}
                onScrollRatio={setScrollRatio}
              />
            </div>
            <div
              className={`resize-handle${resizeRef.current.dragging ? ' dragging' : ''}`}
              onMouseDown={(e) => {
                resizeRef.current.dragging = true
                resizeRef.current.startX = e.clientX
                resizeRef.current.startRatio = splitRatio
              }}
            />
            <div className="preview-pane" style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}>
              <div className="preview-wrapper">
                <MarkdownPreview content={previewContent || content} scrollRatio={scrollRatio} />
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

      {/* Share dialog */}
      {showShareDialog && (
        <ShareDialog
          documentId={id!}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {/* Discard confirm */}
      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard Changes"
          message="Are you sure you want to discard all unsaved changes?"
          confirmLabel="Discard"
          onConfirm={confirmDiscard}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  )
}
