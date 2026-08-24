import type { ExcalidrawSceneData } from '../components/ExcalidrawEditor.js'

/**
 * Excalidraw rewrites several element fields when it loads a scene:
 * null collections become [], and the collaboration/layout metadata
 * (version, versionNonce, updated, index, seed) is regenerated on restore.
 * Canonicalize them so that merely opening a document never counts as a
 * user change. Z-order edits are still detected via element array order.
 */
const VOLATILE_ELEMENT_FIELDS = ['version', 'versionNonce', 'updated', 'index', 'seed']

function canonicalElement(el: unknown): unknown {
  if (!el || typeof el !== 'object') return el
  const record = el as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (VOLATILE_ELEMENT_FIELDS.includes(key)) continue
    out[key] = value
  }
  for (const collectionKey of ['boundElements', 'groupIds']) {
    if (out[collectionKey] === null) out[collectionKey] = []
  }
  return out
}

export function normalizeScene(scene: ExcalidrawSceneData): string {
  // files is deliberately excluded: Excalidraw fills it during scene init
  // (fonts etc.), which must not count as a user change.
  return JSON.stringify({
    elements: (scene.elements ?? []).map(canonicalElement),
    appState: {
      viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
    },
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

const DRAFT_PREFIX = 'excalidraw-draft:'

/**
 * Unsaved-scene drafts: switching tabs unmounts the diagram page, so an
 * unsaved scene would otherwise be lost. Keep the draft in sessionStorage
 * and restore it when the document is opened again.
 */
export function saveSceneDraft(documentId: string, scene: ExcalidrawSceneData): void {
  try {
    sessionStorage.setItem(DRAFT_PREFIX + documentId, serializeSceneForSave(scene))
  } catch {
    // storage unavailable — draft lives only for this session anyway
  }
}

export function loadSceneDraft(documentId: string): ExcalidrawSceneData | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + documentId)
    if (!raw) return null
    return JSON.parse(raw) as ExcalidrawSceneData
  } catch {
    return null
  }
}

export function clearSceneDraft(documentId: string): void {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + documentId)
  } catch {
    // ignore
  }
}
