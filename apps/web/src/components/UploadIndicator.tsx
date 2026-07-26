interface UploadIndicatorProps {
  uploading: boolean
  progress: number
  error: string | null
}

export function UploadIndicator({ uploading, progress, error }: UploadIndicatorProps) {
  if (!uploading && !error) return null

  return (
    <div className={`upload-indicator ${error ? 'upload-error' : ''}`}>
      {uploading && (
        <div className="upload-progress">
          <div className="upload-progress-bar-bg">
            <div className="upload-progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="upload-progress-text">{progress}%</span>
        </div>
      )}
      {error && <span className="upload-error-text">{error}</span>}
    </div>
  )
}
