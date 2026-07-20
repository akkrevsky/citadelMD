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
    fetch(`/api/shares/${token}`)
      .then(r => r.json())
      .then(data => {
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
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!documentData) return <div style={{ padding: '40px', textAlign: 'center' }}>Document not found</div>

  const isReadOnly = documentData.permission === 'READ'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '0.8rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px' }}>
          Shared {isReadOnly ? 'Read-only' : 'Editable'}
        </span>
        <h1 style={{ margin: 0, fontSize: '1.2rem', flex: 1 }}>{documentData.title}</h1>
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
