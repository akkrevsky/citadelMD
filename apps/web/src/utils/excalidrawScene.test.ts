import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeScene,
  serializeSceneForSave,
  saveSceneDraft,
  loadSceneDraft,
  clearSceneDraft,
} from './excalidrawScene'
import type { ExcalidrawSceneData } from '../components/ExcalidrawEditor.js'

function scene(elements: readonly unknown[]): ExcalidrawSceneData {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'citadelmd',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('normalizeScene', () => {
  it('ignores non-essential fields', () => {
    const a = scene([{ id: '1', type: 'rectangle' }])
    const b = { ...a, version: 99, source: 'other', files: { junk: {} } as never }
    expect(normalizeScene(a)).toBe(normalizeScene(b))
  })

  it('detects element changes', () => {
    expect(normalizeScene(scene([{ id: '1' }]))).not.toBe(normalizeScene(scene([{ id: '2' }])))
  })
})

describe('scene drafts', () => {
  it('saves, loads and clears a draft', () => {
    expect(loadSceneDraft('doc-1')).toBeNull()
    saveSceneDraft('doc-1', scene([{ id: 'a' }]))
    const loaded = loadSceneDraft('doc-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.elements).toEqual([{ id: 'a' }])
    clearSceneDraft('doc-1')
    expect(loadSceneDraft('doc-1')).toBeNull()
  })

  it('serializes drafts the same way as saves', () => {
    saveSceneDraft('doc-1', scene([{ id: 'a' }]))
    expect(sessionStorage.getItem('excalidraw-draft:doc-1')).toBe(
      serializeSceneForSave(scene([{ id: 'a' }])),
    )
  })

  it('returns null for corrupted drafts', () => {
    sessionStorage.setItem('excalidraw-draft:doc-1', '{not json')
    expect(loadSceneDraft('doc-1')).toBeNull()
  })
})
