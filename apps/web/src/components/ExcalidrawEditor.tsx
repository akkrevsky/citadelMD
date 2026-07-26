import { useState, useCallback, useEffect } from 'react'

interface ExcalidrawEditorProps {
  onSave: (svgDataUrl: string) => void
  onClose: () => void
}

function ExcalidrawEditor({ onSave, onClose }: ExcalidrawEditorProps) {
  const [Excalidraw, setExcalidraw] = useState<any>(null)
  const [elRef, setElRef] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    import('@excalidraw/excalidraw')
      .then((mod) => {
        setExcalidraw(() => mod.Excalidraw)
        setLoading(false)
      })
      .catch((err: Error) => {
        setLoadError('Failed to load Excalidraw: ' + err.message)
        setLoading(false)
      })
  }, [])

  const handleExport = useCallback(async () => {
    if (!elRef) return
    setIsSaving(true)
    try {
      const elements = elRef.getSceneElements()
      const appState = elRef.getAppState()
      const files = elRef.getFiles()
      const { exportToSvg } = await import('@excalidraw/excalidraw')
      const svg = await exportToSvg({ elements, appState, files, exportBackground: true, exportWithDarkMode: false })
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
      onSave(`data:image/svg+xml;base64,${svgBase64}`)
    } catch (error) {
      console.error('Excalidraw export failed:', error)
    } finally {
      setIsSaving(false)
    }
  }, [elRef, onSave])

  if (loading)
    return (
      <div className="excalidraw-loading">
        Loading diagram editor...
      </div>
    )
  if (loadError)
    return (
      <div className="excalidraw-error">{loadError}</div>
    )
  if (!Excalidraw) return null

  return (
    <div className="excalidraw-container">
      <Excalidraw
        excalidrawAPI={(api: any) => setElRef(api)}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false },
          tools: { image: false },
          dockedSidebarBreakpoint: 0,
        }}
      />
      <div className="excalidraw-footer">
        <button className="btn btn-primary btn-sm" onClick={handleExport} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Insert into document'}
        </button>
        <button className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default ExcalidrawEditor
