import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Document } from '../api-client.js'
import { RevisionTree } from '../components/RevisionTree.js'
import { ShareDialog } from '../components/ShareDialog.js'
import { ConfirmModal } from '../components/ConfirmModal.js'
import { IconSave, IconCommit, IconDiscard, IconShare, IconHistory, IconDashboard } from '../components/icons.js'
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
import { formatUpdatedAt } from '../utils/string.js'
import { isModShortcut } from '../utils/keyboard.js'
import {
  normalizeScene,
  serializeSceneForSave,
  saveSceneDraft,
  loadSceneDraft,
  clearSceneDraft,
} from '../utils/excalidrawScene.js'
import {
  suppressSceneChanges,
  type ExcalidrawSceneData,
} from '../components/ExcalidrawEditor.js'

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
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [historyTick, setHistoryTick] = useState(0)
  const sceneRef = useRef<ExcalidrawSceneData | null>(null)
  const baselineRef = useRef('')
  const loadedKey = useRef(0)
  const restoredDraftRef = useRef(false)
  const prevDocIdRef = useRef(documentId)

  // The old editor instance fires a teardown change when the document
  // switches (render runs before the old instance unmounts) or the page
  // unmounts — suppress those so they never re-mark the document dirty.
  if (prevDocIdRef.current !== documentId) {
    prevDocIdRef.current = documentId
    suppressSceneChanges()
  }
  useEffect(() => {
    return () => suppressSceneChanges()
  }, [])

  const usesGit = doc.folderMode !== 'SNAPSHOT'

  function applyDirtyState(dirty: boolean) {
    setHasChanges(dirty)
    if (dirty) {
      setUnsavedChanges(documentId)
      setUncommittedChanges(documentId)
    } else {
      clearUnsavedChanges(documentId)
      clearUncommittedChanges(documentId)
    }
  }

  const loadScene = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [raw, docMeta] = await Promise.all([
        api.exportDocument(documentId),
        api.getDocument(documentId),
      ])
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
      const baseline = normalizeScene(parsed)
      baselineRef.current = baseline
      const draft = loadSceneDraft(documentId)
      const restored = draft ? normalizeScene(draft) !== baseline : false
      restoredDraftRef.current = restored
      sceneRef.current = draft ?? parsed
      setScene(draft ?? parsed)
      // The current editor instance will unmount when loadedKey changes and
      // fires a teardown change — suppress it before the remount.
      suppressSceneChanges()
      loadedKey.current += 1
      if (docMeta) {
        setDoc(docMeta)
      }
      applyDirtyState(restored || (docMeta?.hasUncommittedChanges ?? false))
    } catch (err) {
      console.error('Failed to load diagram:', err)
      setError('Failed to load diagram')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    setEditedTitle(initialDoc.title)
    updateTabTitle(documentId, initialDoc.title)
    void loadScene()
  }, [documentId, initialDoc.title, loadScene, updateTabTitle])

  useEffect(() => {
    setDoc(initialDoc)
  }, [initialDoc])

  // Fired once after the editor settles (fonts loaded, Excalidraw done
  // reflowing text-bound elements). Adopt the settled scene as the new
  // baseline so the load-time reflow never counts as a user change — unless
  // a draft was restored, in which case the user's unsaved edits stay dirty.
  const handleSceneSettled = useCallback(
    (settled: ExcalidrawSceneData) => {
      // Do NOT setScene here — the scene state only drives the initial
      // mount; feeding the settled scene back would reset the canvas.
      sceneRef.current = settled
      if (!restoredDraftRef.current) {
        baselineRef.current = normalizeScene(settled)
      }
    },
    [],
  )

  const handleSceneChange = useCallback(
    (next: ExcalidrawSceneData) => {
      sceneRef.current = next
      const changed = normalizeScene(next) !== baselineRef.current
      applyDirtyState(changed)
      if (changed) {
        saveSceneDraft(documentId, next)
      } else {
        clearSceneDraft(documentId)
      }
    },
    [documentId],
  )

  const handleSave = useCallback(async () => {
    if (!sceneRef.current) return
    if (!hasChanges) {
      createToast(setToasts, 'Нет несохранённых изменений', 'info')
      return
    }
    try {
      setIsSaving(true)
      const content = serializeSceneForSave(sceneRef.current)
      if (usesGit) {
        await api.putDocumentContent(documentId, content, true, 'Auto-save')
      } else {
        await api.putDocumentContent(documentId, content)
      }
      baselineRef.current = normalizeScene(sceneRef.current)
      clearSceneDraft(documentId)
      applyDirtyState(false)
      setHistoryTick((t) => t + 1)
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
  }, [documentId, usesGit, hasChanges])

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      createToast(setToasts, 'Please enter a commit message', 'error')
      return
    }
    try {
      setIsCommitting(true)
      if (hasChanges && sceneRef.current) {
        await api.putDocumentContent(documentId, serializeSceneForSave(sceneRef.current))
      }
      await api.commitDocument(documentId, commitMessage.trim())
      setCommitMessage('')
      if (sceneRef.current) {
        baselineRef.current = normalizeScene(sceneRef.current)
      }
      clearSceneDraft(documentId)
      applyDirtyState(false)
      setHistoryTick((t) => t + 1)
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
    // Closing the confirm modal resizes the canvas, which makes Excalidraw
    // fire a change with the still-edited scene before loadScene can arm the
    // suppression — arm it first so the discard actually sticks.
    suppressSceneChanges()
    setShowDiscardConfirm(false)
    try {
      setIsDiscarding(true)
      await api.discardDocument(documentId)
      clearSceneDraft(documentId)
      applyDirtyState(false)
      setHistoryTick((t) => t + 1)
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
    setHistoryTick((t) => t + 1)
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
      if (isModShortcut(e, 'KeyS')) {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChanges, handleSave])

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
              <div className="document-title-row">
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
                {doc.updatedAt && (
                  <span className="document-updated-at">{formatUpdatedAt(doc.updatedAt)}</span>
                )}
              </div>
              <span className="document-path" title={fullTitlePath}>
                {fullTitlePath}
              </span>
            </div>
          </div>

          <div className="document-toolbar">
            {hasChanges && <span className="changes-indicator">Unsaved changes</span>}

            <button
              onClick={() => void handleSave()}
              disabled={isSaving || isCommitting}
              title="Сохранить диаграмму"
              className="btn-primary"
            >
              <IconSave /> {isSaving ? 'Saving...' : 'Save'}
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
                  <IconCommit /> {isCommitting ? 'Committing...' : 'Commit'}
                </button>
              </div>
            )}

            {usesGit && (
              <button
                onClick={() => setShowDiscardConfirm(true)}
                disabled={isDiscarding || !hasChanges}
                className="discard-button"
              >
                <IconDiscard /> {isDiscarding ? 'Discarding...' : 'Discard'}
              </button>
            )}

            <button onClick={() => setShowShareDialog(true)}>
              <IconShare /> Share
            </button>

            {usesGit && (
              <button
                onClick={() => {
                  setShowHistory((v) => {
                    const next = !v
                    if (next) setHistoryTick((t) => t + 1)
                    return next
                  })
                }}
              >
                <IconHistory /> {showHistory ? 'Скрыть историю' : 'История'}
              </button>
            )}

            <button onClick={() => navigate('/')}>
              <IconDashboard /> Dashboard
            </button>
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
                  onSettled={handleSceneSettled}
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
              <RevisionTree documentId={documentId} refreshToken={historyTick} onRestore={handleRestore} />
            </div>
          </aside>
        )}
      </div>

      {showShareDialog && (
        <ShareDialog
          documentId={documentId}
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
        fileName={`${doc.title}.excalidraw`}
        showConnection={false}
        modeLabel="Diagram"
        hasUncommittedChanges={hasChanges}
      />

      <ToastContainer
        toasts={toasts}
        onRemove={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))}
      />
    </div>
  )
}
