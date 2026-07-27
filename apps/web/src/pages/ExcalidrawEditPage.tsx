import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Document } from '../api-client.js'
import { RevisionTree } from '../components/RevisionTree.js'
import { ConfirmModal } from '../components/ConfirmModal.js'
import { ToastContainer, createToast, type ToastData } from '../components/Toast.js'
import { StatusBar } from '../components/StatusBar.js'
import { useTheme } from '../hooks/useTheme'
import { useTabs } from '../contexts/TabsContext.js'
import {
  setUnsavedChanges,
  clearUnsavedChanges,
  setUncommittedChanges,
  clearUncommittedChanges,
} from '../utils/unsaved.js'
import { truncate, formatUpdatedAt } from '../utils/string.js'
import type { ExcalidrawSceneData } from '../components/ExcalidrawEditor.js'

const ExcalidrawEditor = React.lazy(() => import('../components/ExcalidrawEditor.js'))

interface ExcalidrawEditPageProps {
  documentId: string
  initialDoc: Document
}

export function ExcalidrawEditPage({ documentId, initialDoc }: ExcalidrawEditPageProps) {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { updateTabTitle } = useTabs()
  const [doc, setDoc] = useState<Document>(initialDoc)
  const [scene, setScene] = useState<ExcalidrawSceneData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [editedTitle, setEditedTitle] = useState(initialDoc.title)
  const [showHistory, setShowHistory] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const sceneRef = useRef<ExcalidrawSceneData | null>(null)
  const loadedKey = useRef(0)

  const usesGit = doc.folderMode !== 'SNAPSHOT'

  const loadScene = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const raw = await api.exportDocument(documentId)
      let parsed: ExcalidrawSceneData
      try {
        parsed = JSON.parse(raw) as ExcalidrawSceneData
      } catch {
        parsed = {
          type: 'excalidraw',
          version: 2,
          source: 'citadelmd',
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' },
          files: {},
        }
      }
      sceneRef.current = parsed
      setScene(parsed)
      loadedKey.current += 1
      setHasChanges(false)
      clearUnsavedChanges(documentId)
    } catch (err) {
      console.error('Failed to load diagram:', err)
      setError('Failed to load diagram')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    setDoc(initialDoc)
    setEditedTitle(initialDoc.title)
    updateTabTitle(documentId, initialDoc.title)
    loadScene()
  }, [documentId, initialDoc, loadScene, updateTabTitle])

  const handleSceneChange = useCallback(
    (next: ExcalidrawSceneData) => {
      sceneRef.current = next
      setHasChanges(true)
      setUnsavedChanges(documentId)
      setUncommittedChanges(documentId)
    },
    [documentId],
  )

  const handleSave = async () => {
    if (!sceneRef.current) return
    try {
      setIsSaving(true)
      const content = JSON.stringify(sceneRef.current, null, 2)
      await api.putDocumentContent(documentId, content)
      setHasChanges(false)
      clearUnsavedChanges(documentId)
      setUncommittedChanges(documentId)
      const refreshed = await api.getDocument(documentId)
      setDoc(refreshed)
      window.dispatchEvent(new CustomEvent('document-saved', { detail: { id: documentId } }))
      createToast(setToasts, 'Saved', 'success')
    } catch (err) {
      console.error('Save failed:', err)
      createToast(setToasts, 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      createToast(setToasts, 'Please enter a commit message', 'error')
      return
    }
    try {
      setIsCommitting(true)
      if (hasChanges && sceneRef.current) {
        await api.putDocumentContent(documentId, JSON.stringify(sceneRef.current, null, 2))
      }
      await api.commitDocument(documentId, commitMessage.trim())
      setCommitMessage('')
      setHasChanges(false)
      clearUnsavedChanges(documentId)
      clearUncommittedChanges(documentId)
      const refreshed = await api.getDocument(documentId)
      setDoc(refreshed)
      window.dispatchEvent(new CustomEvent('document-saved', { detail: { id: documentId } }))
      createToast(setToasts, 'Changes committed successfully!', 'success')
    } catch (err) {
      console.error('Commit failed:', err)
      createToast(
        setToasts,
        'Commit failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
        'error',
      )
    } finally {
      setIsCommitting(false)
    }
  }

  const confirmDiscard = async () => {
    setShowDiscardConfirm(false)
    try {
      setIsDiscarding(true)
      await api.discardDocument(documentId)
      setHasChanges(false)
      clearUnsavedChanges(documentId)
      clearUncommittedChanges(documentId)
      createToast(setToasts, 'Changes discarded', 'info')
      await loadScene()
      const refreshed = await api.getDocument(documentId)
      setDoc(refreshed)
    } catch (err) {
      console.error('Discard failed:', err)
      createToast(
        setToasts,
        'Discard failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
        'error',
      )
    } finally {
      setIsDiscarding(false)
    }
  }

  const handleRestore = async (_sha: string) => {
    createToast(setToasts, `Restored to ${_sha.substring(0, 7)}`, 'success')
    await loadScene()
    const refreshed = await api.getDocument(documentId)
    setDoc(refreshed)
    window.dispatchEvent(new CustomEvent('document-saved', { detail: { id: documentId } }))
  }

  async function handleTitleBlur() {
    if (editedTitle !== doc.title && editedTitle.trim()) {
      try {
        await api.updateDocument(documentId, { title: editedTitle.trim() })
        setDoc({ ...doc, title: editedTitle.trim() })
        updateTabTitle(documentId, editedTitle.trim())
      } catch {
        setEditedTitle(doc.title)
      }
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 's') {
        e.preventDefault()
        if (hasChanges) void handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const folderPath =
    doc.filePath.includes('/') ? doc.filePath.slice(0, doc.filePath.lastIndexOf('/')) : ''
  const fullTitlePath = folderPath ? `${folderPath}/${doc.title}` : doc.title

  if (loading && !scene) {
    return (
      <div className="document-edit-page">
        <div className="document-body">
          <div className="loading">Loading diagram...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="document-edit-page">
        <div className="document-body">
          <div className="error">{error}</div>
          <button onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`document-edit-page${showHistory && usesGit ? ' history-open' : ''}`}>
      <div className="document-main-row">
        <div className="document-body">
          <div className="document-header">
            <div className="document-info">
              <input
                className="document-title-input"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                placeholder="Diagram title"
                title={fullTitlePath}
              />
              <span className="document-path" title={fullTitlePath}>
                {truncate(doc.title, 25)}
                {doc.updatedAt && (
                  <span className="document-updated-at"> · {formatUpdatedAt(doc.updatedAt)}</span>
                )}
              </span>
            </div>

            <div className="document-actions">
              {hasChanges && <span className="changes-indicator">Unsaved changes</span>}

              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving || isCommitting}
                className="btn btn-sm btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save'}
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
                    {isCommitting ? 'Committing...' : 'Commit'}
                  </button>
                </div>
              )}

              {usesGit && (
                <button
                  onClick={() => setShowDiscardConfirm(true)}
                  disabled={isDiscarding || !hasChanges}
                  className="discard-button"
                >
                  {isDiscarding ? 'Discarding...' : 'Discard'}
                </button>
              )}

              {usesGit && (
                <button
                  className={showHistory ? 'btn btn-sm btn-primary' : ''}
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? 'Скрыть историю' : 'История'}
                </button>
              )}

              <button onClick={() => navigate('/')}>Dashboard</button>
            </div>
          </div>

          <div className="excalidraw-page-canvas">
            <Suspense
              fallback={
                <div className="excalidraw-loading">Loading diagram editor...</div>
              }
            >
              {scene && (
                <ExcalidrawEditor
                  key={`${documentId}-${loadedKey.current}`}
                  initialData={scene}
                  onChange={handleSceneChange}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                />
              )}
            </Suspense>
          </div>
        </div>

        {showHistory && usesGit && (
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
              <RevisionTree documentId={documentId} onRestore={handleRestore} />
            </div>
          </aside>
        )}
      </div>

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
        fileName={`${doc.title}.excalidraw`}
        showConnection={false}
        modeLabel="Diagram · Save to disk"
        hasUncommittedChanges={hasChanges}
      />

      <ToastContainer
        toasts={toasts}
        onRemove={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))}
      />
    </div>
  )
}
