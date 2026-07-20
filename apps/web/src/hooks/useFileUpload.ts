import { useState, useCallback, useEffect } from 'react'

interface UploadState {
  isUploading: boolean
  progress: number
  error: string | null
}

interface UseFileUploadOptions {
  documentId: string
  onInsert: (text: string) => void
}

interface UseFileUploadReturn {
  uploadState: UploadState
  uploadFile: (file: File) => Promise<void>
  handlePaste: (e: ClipboardEvent) => void
  handleDrop: (e: DragEvent) => void
  handleDragOver: (e: DragEvent) => void
}

export function useFileUpload({ documentId, onInsert }: UseFileUploadOptions): UseFileUploadReturn {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  })

  const getAuthToken = useCallback((): string | null => {
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/)
    return match ? match[1] : null
  }, [])

  const uploadFile = useCallback(async (file: File) => {
    setUploadState({ isUploading: true, progress: 0, error: null })

    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentId', documentId)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/uploads')

      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadState((s) => ({ ...s, progress: Math.round((e.loaded / e.total) * 100) }))
        }
      }

      const result = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed'))
            } catch {
              reject(new Error('Upload failed'))
            }
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })

      // Insert markdown image syntax
      const isImage = file.type.startsWith('image/')
      const insertText = isImage
        ? `![${file.name}](${result.upload.url})\n`
        : `[${file.name}](${result.upload.url})\n`

      onInsert(insertText)
      setUploadState({ isUploading: false, progress: 100, error: null })
    } catch (err: any) {
      setUploadState({ isUploading: false, progress: 0, error: err.message })
    }
  }, [documentId, onInsert, getAuthToken])

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) uploadFile(file)
        break
      }
    }
  }, [uploadFile])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.startsWith('text/')) {
      uploadFile(file)
    }
  }, [uploadFile])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
  }, [])

  return { uploadState, uploadFile, handlePaste, handleDrop, handleDragOver }
}
