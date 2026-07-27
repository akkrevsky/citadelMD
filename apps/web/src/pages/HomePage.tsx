import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api-client'
import type { DashboardContext } from './DashboardPage'

/**
 * Persistence keys: store "visited" state and the last opened document id
 * so the app auto-resumes on every page load.
 */
const STORAGE_KEY = 'citadelmd-homepage-visited'
const LAST_DOC_KEY = 'citadelmd-last-opened-id'

function findFirstFolder(items: { type: string; id: string; children?: typeof items }[]): string | null {
  for (const item of items) {
    if (item.type === 'folder') return item.id
    if (item.children) {
      const found = findFirstFolder(item.children)
      if (found) return found
    }
  }
  return null
}

export default function HomePage() {
  const navigate = useNavigate()
  const { selectedFolderId } = useOutletContext<DashboardContext>()
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Auto-resume: on every page load, reopen the last document (or first on first visit)
  useEffect(() => {
    const lastDocId = localStorage.getItem(LAST_DOC_KEY)

    if (localStorage.getItem(STORAGE_KEY)) {
      // Repeat visit — go back to the last opened document
      if (lastDocId) navigate(`/documents/${lastDocId}/edit`)
      return
    }

    // First visit — find the first document in the tree and open it
    api.getTree().then((items) => {
      function findFirstDoc(docs: typeof items): string | null {
        for (const item of docs) {
          if (item.type === 'document') return item.id
          if (item.children) {
            const found = findFirstDoc(item.children)
            if (found) return found
          }
        }
        return null
      }
      const firstId = findFirstDoc(items)
      if (firstId) {
        localStorage.setItem(STORAGE_KEY, '1')
        localStorage.setItem(LAST_DOC_KEY, firstId)
        navigate(`/documents/${firstId}/edit`)
      }
    }).catch(() => {
      // tree unavailable — stay on homepage
    })
  }, [navigate])

  // Track the active document id so we can restore it next time
  useEffect(() => {
    const checkDoc = () => {
      const m = window.location.pathname.match(/^\/documents\/([^/]+)\/edit$/)
      if (m) {
        localStorage.setItem(LAST_DOC_KEY, m[1])
        localStorage.setItem(STORAGE_KEY, '1')
      }
    }
    checkDoc()
    // Mark beforeunload as well
    window.addEventListener('beforeunload', checkDoc)
    return () => window.removeEventListener('beforeunload', checkDoc)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setError('')
    try {
      const tree = await api.getTree()
      const folderId = selectedFolderId ?? findFirstFolder(tree)
      if (!folderId) {
        setError('Select a folder first')
        return
      }
      const doc = await api.createDocument(folderId, newTitle.trim())
      navigate(`/documents/${doc.id}/edit`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="main-header">
        <h1>Dashboard</h1>
      </div>
      <div className="main-content">
        {!showCreate ? (
          <div className="placeholder-content">
            <p>Select a document or create a new one to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Create New Document
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="create-doc-form">
            <h3>Create New Document</h3>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Document title"
              autoFocus
              required
            />
            {error && <div className="error-message">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowCreate(false); setError('') }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
