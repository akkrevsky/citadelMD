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
  /** Fired once after the editor settles (fonts loaded, Excalidraw done
   *  reflowing text-bound elements) with the settled scene. */
  onSettled?: (scene: ExcalidrawSceneData) => void
  theme?: 'light' | 'dark'
}

function ExcalidrawEditor({ initialData, onChange, onSettled, theme = 'light' }: ExcalidrawEditorProps) {
  const [Excalidraw, setExcalidraw] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const apiRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  const onSettledRef = useRef(onSettled)
  const readyRef = useRef(false)
  const settledRef = useRef(false)
  onChangeRef.current = onChange
  onSettledRef.current = onSettled

  // Excalidraw fires change events while restoring a scene: it reflows
  // text-bound elements when fonts finish loading, mutating real geometry
  // (x/y/width/height). Such programmatic changes must never count as user
  // edits. Gate change events until the FIRST user interaction with the
  // canvas (pointerdown/keydown); at that moment snapshot the current scene
  // and report it as settled so the caller rebaselines against it.
  const settleNow = useCallback(() => {
    if (settledRef.current) {
      readyRef.current = true
      return
    }
    const api = apiRef.current
    if (!api) return
    settledRef.current = true
    readyRef.current = true
    if (onSettledRef.current) {
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      onSettledRef.current({
        type: 'excalidraw',
        version: 2,
        source: 'citadelmd',
        elements: elements ?? [],
        appState: { viewBackgroundColor: appState?.viewBackgroundColor ?? '#ffffff' },
        files: {},
      })
    }
  }, [])

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
    <div
      className="excalidraw-canvas"
      onPointerDownCapture={settleNow}
      onKeyDownCapture={settleNow}
    >
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
