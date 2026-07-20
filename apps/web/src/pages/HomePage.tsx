import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api-client'

export default function HomePage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setError('')
    try {
      const tree = await api.getTree()
      const rootId = tree.length > 0 ? tree[0].id : 'root'
      const doc = await api.createDocument(rootId, newTitle.trim())
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
