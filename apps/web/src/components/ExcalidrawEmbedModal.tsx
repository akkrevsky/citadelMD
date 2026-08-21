import { useState, useCallback, useEffect, useRef, type ComponentType } from 'react'
import '@excalidraw/excalidraw/index.css'

interface ExcalidrawEmbedModalProps {
  onInsert: (svgDataUrl: string) => void
  onClose: () => void
  theme?: 'light' | 'dark'
}

function svgToDataUrl(svg: SVGSVGElement): string {
  const svgString = new XMLSerializer().serializeToString(svg)
  const bytes = new TextEncoder().encode(svgString)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export function ExcalidrawEmbedModal({ onInsert, onClose, theme = 'light' }: ExcalidrawEmbedModalProps) {
  const [Excalidraw, setExcalidraw] = useState<ComponentType<Record<string, unknown>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const apiRef = useRef<{ exportToSvg: (opts: Record<string, unknown>) => Promise<SVGSVGElement> } | null>(null)

  useEffect(() => {
    let cancelled = false
    import('@excalidraw/excalidraw')
      .then((mod) => {
        if (cancelled) return
        setExcalidraw(() => mod.Excalidraw as ComponentType<Record<string, unknown>>)
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

  const handleInsert = useCallback(async () => {
    if (!apiRef.current) return
    setIsSaving(true)
    try {
      const svg = await apiRef.current.exportToSvg({
        exportBackground: true,
        exportWithDarkMode: theme === 'dark',
      })
      onInsert(svgToDataUrl(svg))
    } catch (error) {
      console.error('Excalidraw export failed:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onInsert, theme])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="share-overlay" onClick={onClose} role="presentation">
      <div
        className="excalidraw-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Insert Excalidraw diagram"
      >
        <div className="excalidraw-modal-canvas">
          {loading && <div className="excalidraw-loading">Loading diagram editor...</div>}
          {loadError && <div className="excalidraw-error">{loadError}</div>}
          {!loading && !loadError && Excalidraw && (
            <Excalidraw
              excalidrawAPI={(api: typeof apiRef.current) => {
                apiRef.current = api
              }}
              theme={theme}
              UIOptions={{
                canvasActions: { loadScene: false, saveToActiveFile: false, export: false },
                tools: { image: false },
              }}
            />
          )}
        </div>
        <div className="excalidraw-footer">
          <button type="button" className="btn btn-primary" onClick={handleInsert} disabled={isSaving || loading || !!loadError}>
            {isSaving ? 'Inserting...' : 'Insert into document'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
