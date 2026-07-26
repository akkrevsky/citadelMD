import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor'

export function GuestDocumentPage() {
  const { token } = useParams<{ token: string }>()
  const [documentData, setDocumentData] = useState<{ id: string; title: string; permission: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/shares/${token}/document`)
      .then((r) => r.json())
      .then((data) => {
        if (data.document) {
          setDocumentData(data.document)
        } else {
          setError('Share link not found or expired')
        }
      })
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
  if (error) return <div style={{ padding: '40px', textAlign: 'center' }} className="error-message">{error}</div>
  if (!documentData) return <div style={{ padding: '40px', textAlign: 'center' }}>Document not found</div>

  const isReadOnly = documentData.permission === 'READ'

  return (
    <div className="guest-document">
      <div className="guest-header">
        <span className="guest-badge">
          Shared {isReadOnly ? 'Read-only' : 'Editable'}
        </span>
        <h1>{documentData.title}</h1>
      </div>
      <div style={{ flex: 1 }}>
        <CollaborativeEditor
          documentId={documentData.id}
          readOnly={isReadOnly}
          shareToken={token}
        />
      </div>
    </div>
  )
}
