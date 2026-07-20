interface UploadIndicatorProps {
  isUploading: boolean
  progress: number
  error: string | null
}

export function UploadIndicator({ isUploading, progress, error }: UploadIndicatorProps) {
  if (error) {
    return <span className="upload-indicator upload-error" title={error}>Upload failed</span>
  }
  if (isUploading) {
    return (
      <span className="upload-indicator upload-progress">
        <span className="upload-spinner" />
        Uploading... {progress}%
      </span>
    )
  }
  return null
}
