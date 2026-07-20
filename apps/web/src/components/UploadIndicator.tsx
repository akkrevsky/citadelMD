interface UploadIndicatorProps {
  uploading: boolean
  progress: number
  error: string | null
}

export function UploadIndicator({ uploading, progress, error }: UploadIndicatorProps) {
  if (!uploading && !error) return null

  return (
    <div className={`upload-indicator ${error ? 'upload-error' : ''}`}
      style={{
        padding: '8px', margin: '4px 0', borderRadius: '4px',
        background: error ? '#fef2f2' : '#f0f9ff',
      }}
    >
      {uploading && (
        <div className="upload-progress" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#3b82f6', borderRadius: '4px', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{progress}%</span>
        </div>
      )}
      {error && <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{error}</span>}
    </div>
  )
}
