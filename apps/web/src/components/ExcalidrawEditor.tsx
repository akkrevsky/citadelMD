import { useState, useCallback } from 'react'

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

  useState(() => {
    import('@excalidraw/excalidraw').then((mod) => {
      setExcalidraw(() => mod.Excalidraw)
      setLoading(false)
    }).catch((err: Error) => {
      setLoadError('Failed to load Excalidraw: ' + err.message)
      setLoading(false)
    })
  })

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

  if (loading) return <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading diagram editor...</div>
  if (loadError) return <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>{loadError}</div>
  if (!Excalidraw) return null

  return (
    <div style={{ height: '500px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <Excalidraw
        excalidrawAPI={(api: any) => setElRef(api)}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false }, tools: { image: false }, dockedSidebarBreakpoint: 0 }}
      />
      <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
        <button onClick={handleExport} disabled={isSaving}
          style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {isSaving ? 'Saving...' : 'Insert into document'}
        </button>
        <button onClick={onClose}
          style={{ padding: '6px 16px', background: '#f1f5f9', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default ExcalidrawEditor
