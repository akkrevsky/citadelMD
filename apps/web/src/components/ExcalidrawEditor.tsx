import { useState, useCallback, useEffect, useRef } from 'react'
import '@excalidraw/excalidraw/index.css'
// Fixes Excalidraw's invalid `display: swap` descriptor with a real
// font-display: swap (must come after the package CSS to win the cascade).
import '../styles/excalidraw-fonts.css'

export interface ExcalidrawSceneData {
  type?: string
  version?: number
  source?: string
  elements?: readonly unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

interface ExcalidrawEditorProps {
  initialData?: ExcalidrawSceneData | null
  onChange?: (scene: ExcalidrawSceneData) => void
  theme?: 'light' | 'dark'
}

function ExcalidrawEditor({ initialData, onChange, theme = 'light' }: ExcalidrawEditorProps) {
  const [Excalidraw, setExcalidraw] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const apiRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  const readyRef = useRef(false)
  onChangeRef.current = onChange

  useEffect(() => {
    readyRef.current = false
    const id = window.requestAnimationFrame(() => {
      readyRef.current = true
    })
    return () => window.cancelAnimationFrame(id)
  }, [initialData])

  useEffect(() => {
    let cancelled = false
    import('@excalidraw/excalidraw')
      .then((mod) => {
        if (cancelled) return
        setExcalidraw(() => mod.Excalidraw)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setLoadError('Failed to load Excalidraw: ' + err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = useCallback((elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (!readyRef.current) return
    onChangeRef.current?.({
      type: 'excalidraw',
      version: 2,
      source: 'citadelmd',
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
      },
      files: files ?? {},
    })
  }, [])

  if (loading) {
    return <div className="excalidraw-loading">Loading diagram editor...</div>
  }
  if (loadError) {
    return <div className="excalidraw-error">{loadError}</div>
  }
  if (!Excalidraw) return null

  const preparedInitial = initialData
    ? {
        elements: initialData.elements ?? [],
        appState: {
          ...(initialData.appState ?? {}),
          collaborators: new Map(),
        },
        files: initialData.files ?? {},
      }
    : undefined

  return (
    <div className="excalidraw-canvas">
      <Excalidraw
        excalidrawAPI={(api: any) => {
          apiRef.current = api
        }}
        initialData={preparedInitial}
        onChange={handleChange}
        theme={theme}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false },
          tools: { image: false },
        }}
      />
    </div>
  )
}

export default ExcalidrawEditor
