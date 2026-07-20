import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor.js'
import { MarkdownPreview } from '../components/MarkdownPreview.js'
import { ExcalidrawEditor } from '../components/ExcalidrawEditor.js'
import { UploadIndicator } from '../components/UploadIndicator.js'
import { useFileUpload } from '../hooks/useFileUpload.js'
import { api, type Document } from '../api-client.js'

export function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [showExcalidraw, setShowExcalidraw] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

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

      // Get document metadata
      const docResponse = await api.getDocument(id!)
      setDoc(docResponse)

      // Get document content
      const contentResponse = await api.exportDocument(id!)
      setContent(contentResponse)
      setPreviewContent(contentResponse)

    } catch (error) {
      console.error('Failed to load document:', error)
      setError('Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const handleContentChange = useCallback((newContent: string) => {
    setHasChanges(content !== newContent)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewContent(newContent)
    }, 300)
  }, [content])

  const handleExcalidrawSave = (svgDataUrl: string) => {
    const insertText = '```excalidraw\n' + svgDataUrl + '\n```\n\n'
    handleInsertAtCursor(insertText)
    setShowExcalidraw(false)
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

      // Reload content
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

  return (
    <div
      className="document-edit-page"
      onPaste={handlePaste as unknown as React.ClipboardEventHandler}
      onDrop={handleDrop as unknown as React.DragEventHandler}
      onDragOver={handleDragOver as unknown as React.DragEventHandler}
    >
      <div className="document-header">
        <div className="document-info">
          <h1>{doc.title}</h1>
          <span className="document-path">{doc.filePath}</span>
        </div>

        <div className="document-actions">
          {hasChanges && (
            <span className="changes-indicator">● Unsaved changes</span>
          )}

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
            {isDiscarding ? 'Discarding...' : 'Discard Changes'}
          </button>

          <button onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="editor-toolbar">
        <UploadIndicator {...uploadState} />
        <button onClick={() => window.document.getElementById('file-input')?.click()}>
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
        <button onClick={() => setShowExcalidraw(true)}>Draw Diagram</button>
        <button onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      <div className="editor-section">
        <div className="editor-with-preview">
          <div className="code-editor-pane">
            <CollaborativeEditor
              documentId={id!}
              initialContent={content}
              onContentChange={handleContentChange}
            />
          </div>
          {showPreview && (
            <div className="preview-pane">
              <MarkdownPreview content={previewContent} />
            </div>
          )}
        </div>
      </div>

      {showExcalidraw && (
        <div className="modal-overlay" onClick={() => setShowExcalidraw(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <ExcalidrawEditor
              onSave={handleExcalidrawSave}
              onClose={() => setShowExcalidraw(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
