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
    <div className="share-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Share Document</h3>

        <div className="share-field">
          <label>Permission</label>
          <select value={permission} onChange={(e) => setPermission(e.target.value as 'READ' | 'WRITE')}>
            <option value="READ">Read only</option>
            <option value="WRITE">Can edit</option>
          </select>
        </div>

        <div className="share-field">
          <label>Expires in</label>
          <select value={ttlHours} onChange={(e) => setTtlHours(Number(e.target.value))}>
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
        </div>

        <div className="share-actions">
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create Link'}
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <p className="error-message">{error}</p>}

        {shareUrl && (
          <div className="share-url-box">
            <input readOnly value={shareUrl} />
            <button className="btn btn-primary btn-sm" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
