import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api-client'
import type { DashboardContext } from './DashboardPage'
import { findFirstFolder } from '../utils/tree'
import { AsciiGalaxy } from '../components/AsciiGalaxy.js'
import { AiChatBar } from '../components/AiChatBar.js'

type HomeView = 'agent' | 'chat'

export default function HomePage() {
  const navigate = useNavigate()
  const { selectedFolderId } = useOutletContext<DashboardContext>()
  const [view, setView] = useState<HomeView>('agent')
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
          <div className="castle-home">
            <AsciiGalaxy />
            <div className="home-view-toggle" role="tablist" aria-label="Помощник">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'agent'}
                className={view === 'agent' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                onClick={() => setView('agent')}
              >
                Агент
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'chat'}
                className={view === 'chat' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                onClick={() => setView('chat')}
              >
                Чат
              </button>
            </div>
            {/* Both panels stay mounted so the agent iframe session and the
                chat history survive toggling; `hidden` switches visibility. */}
            <div className="agent-frame-wrap" hidden={view !== 'agent'} data-testid="agent-panel">
              <iframe
                src={`http://${window.location.hostname}:8082/`}
                title="Агент"
                className="agent-frame"
                data-testid="agent-frame"
              />
            </div>
            <div className="chat-panel" hidden={view !== 'chat'} data-testid="chat-panel">
              <AiChatBar />
            </div>
            <div className="castle-home-actions">
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                Create New Document
              </button>
            </div>
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
