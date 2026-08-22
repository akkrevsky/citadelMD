import { useCallback, useRef, useState } from 'react'

interface UseFileUploadOptions {
  documentId: string
  onInsert?: (markdown: string) => void
}

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
}

export function useFileUpload({ documentId, onInsert }: UseFileUploadOptions) {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  })

  const uploadFile = useCallback(async (file: File): Promise<{ url: string; fileName: string } | undefined> => {
    const allowedTypes = ['image/', 'application/pdf', 'text/plain', 'text/markdown']
    if (!allowedTypes.some(t => file.type.startsWith(t))) {
      setUploadState({ uploading: false, progress: 0, error: `File type ${file.type} not allowed` })
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ uploading: false, progress: 0, error: 'File exceeds 25 MB limit' })
      return
    }

    setUploadState({ uploading: true, progress: 0, error: null })

    try {
      const formData = new FormData()
      // documentId MUST come before file — @fastify/multipart only
      // exposes fields that appear before the first file in the stream.
      formData.append('documentId', documentId)
      formData.append('file', file)

      const xhr = new XMLHttpRequest()

      return new Promise<{ url: string; fileName: string } | undefined>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploadState(prev => ({ ...prev, progress }))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText)
            const isImage = file.type.startsWith('image/')
            const markdown = isImage
              ? `![${result.upload.fileName}](${result.upload.url})`
              : `[${result.upload.fileName}](${result.upload.url})`
            onInsert?.(markdown)
            setUploadState({ uploading: false, progress: 100, error: null })
            resolve({ url: result.upload.url, fileName: result.upload.fileName })
          } else {
            try {
              const error = JSON.parse(xhr.responseText)
              setUploadState({ uploading: false, progress: 0, error: error.error?.message || 'Upload failed' })
            } catch {
              setUploadState({ uploading: false, progress: 0, error: 'Upload failed' })
            }
            reject(new Error('Upload failed'))
          }
        })

        xhr.addEventListener('error', () => {
          setUploadState({ uploading: false, progress: 0, error: 'Network error' })
          reject(new Error('Network error'))
        })

        xhr.open('POST', '/api/uploads')
        xhr.withCredentials = true
        xhr.send(formData)
      })
    } catch {
      setUploadState({ uploading: false, progress: 0, error: 'Upload failed' })
    }
  }, [documentId, onInsert])

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        event.preventDefault()
        const file = item.getAsFile()
        if (file) await uploadFile(file)
      }
    }
  }, [uploadFile])

  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault()
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
  }, [uploadFile])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
  }, [])

  return { uploadState, uploadFile, handlePaste, handleDrop, handleDragOver }
}
