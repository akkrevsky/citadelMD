import { useState, useCallback, useRef } from 'react'
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'

interface ExcalidrawEditorProps {
  initialData?: ExcalidrawInitialDataState
  onSave: (svgDataUrl: string) => void
  onClose: () => void
}

export function ExcalidrawEditor({ initialData, onSave, onClose }: ExcalidrawEditorProps) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleExport = useCallback(async () => {
    if (!excalidrawRef.current) return
    setIsSaving(true)

    try {
      const elements = excalidrawRef.current.getSceneElements()
      const appState = excalidrawRef.current.getAppState()
      const files = excalidrawRef.current.getFiles()

      // Use export helper
      const { exportToSvg } = await import('@excalidraw/excalidraw')
      const svg = await exportToSvg({
        elements,
        appState,
        files,
        exportBackground: true,
        exportWithDarkMode: false,
      })

      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

      onSave(dataUrl)
    } catch (error) {
      console.error('Excalidraw export failed:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  return (
    <div className="excalidraw-editor-wrapper" style={{ height: '500px' }}>
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawRef.current = api }}
        initialData={initialData}
      >
        <WelcomeScreen />
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
      <div className="excalidraw-actions">
        <button onClick={handleExport} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Insert into document'}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
