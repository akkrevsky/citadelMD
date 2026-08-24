import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor.js'
import { MarkdownPreview } from '../components/MarkdownPreview.js'
import { EditorToolbar, type ViewMode } from '../components/EditorToolbar.js'
import { StatusBar } from '../components/StatusBar.js'
import { UploadIndicator } from '../components/UploadIndicator.js'
import { ShareDialog } from '../components/ShareDialog.js'
import { ToastContainer, createToast, type ToastData } from '../components/Toast.js'
import { ConfirmModal } from '../components/ConfirmModal.js'
import { IconSave, IconCommit, IconDiscard, IconShare, IconHistory, IconDashboard } from '../components/icons.js'
import { RevisionTree } from '../components/RevisionTree.js'
import { ExcalidrawEditPage } from './ExcalidrawEditPage.js'
import { useFileUpload } from '../hooks/useFileUpload.js'
import { useTheme } from '../hooks/useTheme'
import { api, type Document } from '../api-client.js'
import { useTabs } from '../contexts/TabsContext.js'
import { setUnsavedChanges, clearUnsavedChanges, setUncommittedChanges, clearUncommittedChanges } from '../utils/unsaved.js'
import { formatUpdatedAt } from '../utils/string.js'
import { isModShortcut } from '../utils/keyboard.js'
import { buildFormatCommand } from '../utils/format.js'
import { parseHtmlClipboard, dataUrlToFile } from '../utils/html-to-markdown.js'
import '../styles/editor.css'
import '../styles/preview.css'
import '../styles/toolbar.css'
import '../styles/statusbar.css'
import '../styles/tabbar.css'


const LAST_DOC_KEY = 'citadelmd-last-opened-id'

export function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const { openPreview, pinTab, setActive, updateTabTitle } = useTabs()
  const [doc, setDoc] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [editedTitle, setEditedTitle] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isConnected, setIsConnected] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const [wordWrap, setWordWrap] = useState(() => {
    try {
      return localStorage.getItem('citadelmd-word-wrap') === '1'
    } catch {
      return false
    }
  })

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


  const toggleWordWrap = useCallback(() => {
    setWordWrap((prev) => {
      const next = !prev
      try {
        localStorage.setItem('citadelmd-word-wrap', next ? '1' : '0')
      } catch {
        // localStorage unavailable — keep the session-only toggle
      }
      return next
    })
  }, [])

  const { uploadState, handlePaste, handleDrop, handleDragOver, uploadFile } = useFileUpload({
    documentId: id!,
    onInsert: handleInsertAtCursor,
  })

  // Rich HTML paste: convert formatting to markdown and upload embedded
  // (data-URI) images so they become regular document attachments.
  const handleHtmlPaste = useCallback(
    async (html: string): Promise<string> => {
      const { text, images } = parseHtmlClipboard(html)
      if (images.length === 0) return text

      let markdown = text
      for (let i = 0; i < images.length; i++) {
        const { dataUrl, alt } = images[i]
        try {
          const file = dataUrlToFile(dataUrl, `pasted-image-${i}.png`)
          const result = await uploadFile(file)
          if (result) {
            markdown = markdown.replace(
              `__IMG_${i}__`,
              `![${alt || result.fileName}](${result.url})`,
            )
          }
        } catch {
          // drop failed image placeholders below
        }
      }
      return markdown.replace(/__IMG_\d+__/g, '')
    },
    [uploadFile],
  )


  useEffect(() => {
    if (!id) {
      navigate('/')
      return
    }

    const navState = location.state as { preview?: boolean; pin?: boolean } | null
    const isPreviewNav = navState?.preview === true
    const isPinNav = navState?.pin === true

    if (isPreviewNav) {
      openPreview({ id, title: '' })
      setActive(id)
    } else if (isPinNav) {
      pinTab({ id, title: '' })
      setActive(id)
    } else {
      openPreview({ id, title: '' })
      setActive(id)
    }

    loadDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (id) localStorage.setItem(LAST_DOC_KEY, id)
  }, [id])

  const loadDocument = async () => {
    try {
      setLoading(true)

      const docResponse = await api.getDocument(id!)
      setDoc(docResponse)

      updateTabTitle(id!, docResponse.title)

      if (docResponse.kind === 'EXCALIDRAW') {
        setLoading(false)
        return
      }

      const contentResponse = await api.exportDocument(id!)
      setContent(contentResponse)
      setPreviewContent(contentResponse)
      baselineRef.current = contentResponse
      contentRef.current = contentResponse
      setCommitMessage('')

      const dirty = docResponse.hasUncommittedChanges ?? false
      setHasChanges(dirty)
      if (dirty) {
        setUnsavedChanges(id!)
        setUncommittedChanges(id!)
      } else {
        clearUnsavedChanges(id!)
        clearUncommittedChanges(id!)
      }

    } catch (error) {
      console.error('Failed to load document:', error)
      const message = error instanceof Error ? error.message : ''
      if (message.includes('Document not found')) {
        // The document was deleted (or never existed) — stop auto-resume
        // from bringing users back to a dead URL.
        if (localStorage.getItem(LAST_DOC_KEY) === id) {
          localStorage.removeItem(LAST_DOC_KEY)
        }
        setError('Document not found')
      } else {
        setError('Failed to load document')
      }
    } finally {
      setLoading(false)
    }
  }

  // Baseline content for change detection (last loaded or committed state)
  const baselineRef = useRef('')
  const contentRef = useRef(content)
  const handleContentChange = useCallback((newContent: string) => {
    contentRef.current = newContent
    const changed = newContent !== baselineRef.current
    setHasChanges(changed)
    if (changed) {
      setUnsavedChanges(id!)
      setUncommittedChanges(id!)
    } else {
      clearUnsavedChanges(id!)
      clearUncommittedChanges(id!)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      setPreviewContent(newContent)
    }, 300)
  }, [id])

  const handleFormat = useCallback((type: string) => {
    const detail = buildFormatCommand(type)
    if (Object.keys(detail).length > 0) {
      window.document.dispatchEvent(new CustomEvent('format-command', { detail }))
    }
  }, [])

  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorPos({ line, col })
  }, [])

  const handleDocStats = useCallback((s: { words: number; chars: number; lines: number }) => {
    setStats(s)
  }, [])

  function markSavedBaseline() {
    baselineRef.current = contentRef.current
    // NOTE: do NOT setContent() here — it flows into CollaborativeEditor's
    // initialContent prop and would destroy/recreate the Yjs editor (and its
    // WebSocket) right after save. The editor already holds the current text.
    setPreviewContent(contentRef.current)
    setHasChanges(false)
    clearUnsavedChanges(id!)
    clearUncommittedChanges(id!)
    setHistoryTick((t) => t + 1)
    window.dispatchEvent(new CustomEvent('document-saved', { detail: { id } }))
  }

  const handleSave = async () => {
    if (!hasChanges) {
      createToast(setToasts, 'Нет несохранённых изменений', 'info')
      return
    }
    try {
      setIsCommitting(true)
      const res = await api.commitDocument(id!, 'Auto-save')
      if (res.updatedAt && doc) {
        setDoc({ ...doc, updatedAt: res.updatedAt })
      }
      markSavedBaseline()
      createToast(setToasts, 'Saved', 'success')
    } catch (error) {
      console.error('Save failed:', error)
      createToast(setToasts, 'Save failed', 'error')
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
      const refreshed = await api.getDocument(id!)
      setDoc(refreshed)
      markSavedBaseline()
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

  const handleRestore = async (_sha: string) => {
    createToast(setToasts, `Restored to ${_sha.substring(0, 7)}`, 'success')
    await loadDocument()
    setHistoryTick((t) => t + 1)
  }

  const confirmDiscard = async () => {
    setShowDiscardConfirm(false)
    try {
      setIsDiscarding(true)
      await api.discardDocument(id!)
      createToast(setToasts, 'Changes discarded', 'info')
      await loadDocument()
      setHistoryTick((t) => t + 1)
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

      if (isModShortcut(e, 'KeyS')) {
        e.preventDefault()
        handleSave()
      } else if (isModShortcut(e, 'KeyH')) {
        e.preventDefault()
        window.document.dispatchEvent(new CustomEvent('format-command', { detail: { action: 'find' } }))
      } else if (isModShortcut(e, 'KeyE')) {
        e.preventDefault()
        const cycle: ViewMode[] = ['source', 'split', 'preview']
        const idx = cycle.indexOf(viewMode)
        setViewMode(cycle[(idx + 1) % cycle.length])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, hasChanges, handleSave])

  const readTime = Math.max(1, Math.round(stats.words / 200))
  const usesGit = doc?.folderMode !== 'SNAPSHOT'
  const folderPath =
    doc && doc.filePath.includes('/')
      ? doc.filePath.slice(0, doc.filePath.lastIndexOf('/'))
      : ''
  const fullTitlePath = doc ? (folderPath ? `${folderPath}/${doc.title}` : doc.title) : ''

  if (!loading && !error && doc?.kind === 'EXCALIDRAW' && doc.id === id) {
    return <ExcalidrawEditPage documentId={id} initialDoc={doc} />
  }

  let body: React.ReactNode
  // Stale doc after SPA navigation: until loadDocument finishes for the new
  // id, `doc` still holds the previous document. Rendering the markdown
  // editor in that frame would open a WebSocket for the NEW document (even
  // an Excalidraw one, which must not get Yjs connections).
  if (loading || (doc && doc.id !== id)) {
    body = <div className="loading">Loading document...</div>
  } else if (error) {
    body = (
      <>
        <div className="error">{error}</div>
        <button onClick={() => navigate('/')}>Back to Dashboard</button>
      </>
    )
  } else if (!doc) {
    body = (
      <>
        <div className="error">Document not found</div>
        <button onClick={() => navigate('/')}>Back to Dashboard</button>
      </>
    )
  } else {
    body = (
      <>
      {/* Header with document info and commit controls */}
      <div className="document-header">
        <div className="document-info">
          <div className="document-title-row">
            <input
              className="document-title-input"
              value={editedTitle || doc.title}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="Document title"
              title={fullTitlePath}
            />
            {doc.updatedAt && (
              <span className="document-updated-at">{formatUpdatedAt(doc.updatedAt)}</span>
            )}
          </div>
          <span className="document-path" title={fullTitlePath}>
            {fullTitlePath}
          </span>
        </div>

        <div className="document-actions">
          {hasChanges && (
            <span className="changes-indicator">Unsaved changes</span>
          )}

          <button
            onClick={handleSave}
            disabled={isCommitting}
            title="Сохранить документ"
            className="btn btn-sm btn-primary"
          >
            {isCommitting ? 'Saving...' : (<><IconSave /> Save</>)}
          </button>

          {usesGit && (
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
                {isCommitting ? 'Committing...' : (<><IconCommit /> Commit</>)}
              </button>
            </div>
          )}

          {usesGit && (
            <button
              onClick={handleDiscard}
              disabled={isDiscarding || !hasChanges}
              className="discard-button"
            >
              {isDiscarding ? 'Discarding...' : (<><IconDiscard /> Discard</>)}
            </button>
          )}

          <button onClick={() => setShowShareDialog(true)}>
            <IconShare /> Share
          </button>
          {usesGit && (
            <button
              className={showHistory ? 'btn btn-sm btn-primary' : ''}
              onClick={() => {
                setShowHistory((v) => {
                  const next = !v
                  if (next) setHistoryTick((t) => t + 1)
                  return next
                })
              }}
            >
              {showHistory ? (<><IconHistory /> Скрыть историю</>) : (<><IconHistory /> История</>)}
            </button>
          )}
          <button onClick={() => navigate('/')}>
            <IconDashboard /> Dashboard
          </button>
        </div>
      </div>

      {/* Editor toolbar. On mobile the formatting toolbar collapses into a
          slide-up drawer toggled by the floating peek button. */}
      <div className={`editor-toolbar-slot${mobileToolbarOpen ? ' mobile-open' : ''}`}>
        <button
          type="button"
          className="toolbar-peek-btn"
          onClick={() => setMobileToolbarOpen((v) => !v)}
          title="Formatting toolbar"
          aria-label="Toggle formatting toolbar"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18">
            <path d="M3 2h10v2H3V2Zm0 5h10v2H3V7Zm0 5h10v2H3v-2Z" />
          </svg>
        </button>
        <EditorToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onFormat={handleFormat}
          wordWrap={wordWrap}
          onToggleWrap={toggleWordWrap}
          onSave={() => void handleSave()}
          saveBusy={isCommitting}
          onCommit={() => void handleCommit()}
          commitMessage={commitMessage}
          onCommitMessageChange={setCommitMessage}
          commitBusy={isCommitting}
          onDiscard={() => setShowDiscardConfirm(true)}
          discardDisabled={isDiscarding || !hasChanges}
          onShare={() => setShowShareDialog(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          showHistory={showHistory}
          onToggleHistory={() => {
            setShowHistory((v) => {
              const next = !v
              if (next) setHistoryTick((t) => t + 1)
              return next
            })
          }}
          historyEnabled={true}
        />
      </div>

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
        </div>
      </div>

      {/* Editor section
          A SINGLE CollaborativeEditor instance stays mounted across all view
          modes; switching Code/Split/Preview toggles pane visibility via CSS
          (display) instead of mounting/unmounting components, so in-flight
          edits are never lost on view-mode change. */}
      <div className="editor-section">
        <div className="editor-with-preview">
          <div
            className="code-editor-pane"
            style={{
              display: viewMode === 'preview' ? 'none' : 'flex',
              flex: viewMode === 'split' ? `0 0 ${splitRatio * 100}%` : '1 1 100%',
            }}
          >
            <CollaborativeEditor
              key={`doc-${id}`}
              documentId={id!}
              initialContent={content}
              onContentChange={handleContentChange}
              onCursorChange={handleCursorChange}
              onDocStats={handleDocStats}
              onConnectionChange={(status) => {
                setIsConnected(status === 'connected')
              }}
              onScrollRatio={setScrollRatio}
              lineWrapping={wordWrap}
              onHtmlPaste={handleHtmlPaste}
            />
          </div>

          {viewMode === 'split' && (
            <div
              className={`resize-handle${resizeRef.current.dragging ? ' dragging' : ''}`}
              onMouseDown={(e) => {
                resizeRef.current.dragging = true
                resizeRef.current.startX = e.clientX
                resizeRef.current.startRatio = splitRatio
              }}
            />
          )}

          <div
            className="preview-pane"
            style={{
              // Keep display:flex from CSS (the pane is a flex column so
              // .preview-wrapper's overflow-y:auto actually constrains);
              // only hide it entirely in source mode.
              display: viewMode === 'source' ? 'none' : 'flex',
              flex: viewMode === 'split' ? `0 0 ${(1 - splitRatio) * 100}%` : '1 1 100%',
            }}
          >
            <div className="preview-wrapper">
              <MarkdownPreview content={previewContent || content} scrollRatio={scrollRatio} />
            </div>
          </div>
        </div>
      </div>

      </>
    )
  }

  return (
    <div
      className="document-edit-page"
      onPaste={handlePaste as unknown as React.ClipboardEventHandler}
      onDrop={handleDrop as unknown as React.DragEventHandler}
      onDragOver={handleDragOver as unknown as React.DragEventHandler}
    >
      <div className={`document-main-row${showHistory ? ' history-open' : ''}`}>
        <div className="document-body">{body}</div>

        {showHistory && id && (
          <aside className="history-panel" aria-label="История версий">
            <div className="history-panel-header">
              <h3>История версий</h3>
              <button
                type="button"
                className="history-panel-close"
                onClick={() => setShowHistory(false)}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="history-panel-body">
              {usesGit ? (
                <RevisionTree documentId={id} refreshToken={historyTick} onRestore={handleRestore} />
              ) : (
                <p className="revision-empty">
                  История доступна только в папках с Git-версионированием.
                  Откройте настройки папки (⚙) и выберите режим Git.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      {showShareDialog && id && (
        <ShareDialog
          documentId={id}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard Changes"
          message="Are you sure you want to discard all unsaved changes?"
          confirmLabel="Discard"
          onConfirm={confirmDiscard}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}


      <StatusBar
        words={stats.words}
        chars={stats.chars}
        lines={stats.lines}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        fileName={doc ? `${doc.title}.md` : undefined}
        isConnected={isConnected}
        connectionStatus={isConnected ? 'connected' : 'disconnected'}
        readTime={doc ? readTime : undefined}
        hasUncommittedChanges={hasChanges}
      />

      <ToastContainer toasts={toasts} onRemove={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))} />
    </div>
  )
}
