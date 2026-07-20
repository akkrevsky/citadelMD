import { useState } from 'react'

interface ShareDialogProps {
  documentId: string
  onClose: () => void
}

export function ShareDialog({ documentId, onClose }: ShareDialogProps) {
  const [permission, setPermission] = useState<'READ' | 'WRITE'>('READ')
  const [ttlHours, setTtlHours] = useState(168)
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/shares`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, ttlHours }),
      })
      const data = await res.json()
      if (res.ok) {
        setShareUrl(`${window.location.origin}/share/${data.share.token}`)
      } else {
        setError(data.error?.message || 'Failed to create share')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '8px', padding: '24px',
        minWidth: '400px', maxWidth: '500px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      }}>
        <h3 style={{ margin: '0 0 16px' }}>Share Document</h3>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#64748b' }}>Permission</label>
          <select value={permission} onChange={e => setPermission(e.target.value as 'READ' | 'WRITE')}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
            <option value="READ">Read only</option>
            <option value="WRITE">Can edit</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#64748b' }}>Expires in</label>
          <select value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button onClick={handleCreate} disabled={loading}
            style={{ flex: 1, padding: '8px 16px', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}>
            {loading ? 'Creating...' : 'Create Link'}
          </button>
          <button onClick={onClose}
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #ddd', borderRadius: '4px' }}>
            Close
          </button>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}

        {shareUrl && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px',
            padding: '8px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
            <input readOnly value={shareUrl}
              style={{ flex: 1, padding: '6px', border: 'none', background: 'transparent', fontSize: '0.85rem' }} />
            <button onClick={handleCopy}
              style={{ padding: '6px 12px', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', whiteSpace: 'nowrap' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
