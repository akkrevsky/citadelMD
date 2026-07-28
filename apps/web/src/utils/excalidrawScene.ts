import type { ExcalidrawSceneData } from '../components/ExcalidrawEditor.js'

export function normalizeScene(scene: ExcalidrawSceneData): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'citadelmd',
    elements: scene.elements ?? [],
    appState: {
      viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
    },
    files: scene.files ?? {},
  })
}

export function serializeSceneForSave(scene: ExcalidrawSceneData): string {
  return JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'citadelmd',
      elements: scene.elements ?? [],
      appState: {
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
      },
      files: scene.files ?? {},
    },
    null,
    2,
  )
}
