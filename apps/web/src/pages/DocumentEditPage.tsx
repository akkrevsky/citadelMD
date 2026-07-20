import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor'
import { api, type Document } from '../api-client'

export function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [document, setDocument] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

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
      setDocument(docResponse)
      
      // Get document content  
      const contentResponse = await api.exportDocument(id!)
      setContent(contentResponse)
      
    } catch (error) {
      console.error('Failed to load document:', error)
      setError('Failed to load document')
    } finally {
      setLoading(false)
    }
  }
  
  const handleContentChange = (newContent: string) => {
    setHasChanges(content !== newContent)
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
        alert(`Commit failed: ${error.message}`)
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
        alert(`Discard failed: ${error.message}`)
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

  if (!document) {
    return (
      <div className="document-edit-page">
        <div className="error">Document not found</div>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div className="document-edit-page">
      <div className="document-header">
        <div className="document-info">
          <h1>{document.title}</h1>
          <span className="document-path">{document.filePath}</span>
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
      
      <div className="editor-section">
        <CollaborativeEditor
          documentId={id!}
          initialContent={content}
          onContentChange={handleContentChange}
        />
      </div>
    </div>
  )
}