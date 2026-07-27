import { useEffect, useState } from 'react'
import { api, type UploadItem } from '../api-client'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetsPanel() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listUploads()
      .then(setUploads)
      .catch(() => setUploads([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="tree-empty">Loading assets…</div>
  if (uploads.length === 0) return <div className="tree-empty">No attachments yet</div>

  return (
    <div className="assets-panel">
      {uploads.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="asset-card"
          title={item.documentPath}
        >
          {item.mimeType.startsWith('image/') ? (
            <img src={item.url} alt={item.fileName} className="asset-thumb" />
          ) : (
            <div className="asset-thumb asset-file-icon">📄</div>
          )}
          <div className="asset-info">
            <span className="asset-name">{item.fileName}</span>
            <span className="asset-meta">{formatSize(item.sizeBytes)}</span>
            <span className="asset-doc">{item.documentTitle}</span>
          </div>
        </a>
      ))}
    </div>
  )
}
