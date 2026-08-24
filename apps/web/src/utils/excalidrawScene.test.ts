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

describe('normalizeScene — excalidraw load rewrites', () => {
  it('treats boundElements null and [] as equal', () => {
    const withNull = scene([{ id: '1', type: 'rectangle', boundElements: null }])
    const withArray = scene([{ id: '1', type: 'rectangle', boundElements: [] }])
    expect(normalizeScene(withNull)).toBe(normalizeScene(withArray))
  })

  it('still detects real element changes', () => {
    const a = scene([{ id: '1', type: 'rectangle', boundElements: null }])
    const b = scene([{ id: '1', type: 'rectangle', boundElements: [{ id: '2', type: 'arrow' }] }])
    expect(normalizeScene(a)).not.toBe(normalizeScene(b))
  })
})

describe('normalizeScene — opening an unedited diagram must never look dirty', () => {
  // Excalidraw rewrites volatile per-element fields when it restores a scene
  // (versionNonce/version/updated/index are regenerated on load). Merely
  // opening a diagram fires an onChange with those rewritten values, which
  // must not count as a user change.
  const saved = scene([
    {
      id: '1',
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: 111,
      version: 1,
      versionNonce: 1001,
      updated: 1700000000000,
      index: 'a0',
      boundElements: null,
    },
  ])

  it('ignores rewritten volatile fields on load', () => {
    const reloaded = scene([
      {
        ...(saved.elements![0] as Record<string, unknown>),
        version: 2,
        versionNonce: 2002,
        updated: 1800000000000,
        index: 'b5',
        boundElements: [],
        groupIds: [],
        frameId: null,
        seed: 999,
      },
    ])
    expect(normalizeScene(reloaded)).toBe(normalizeScene(saved))
  })

  it('still detects a real edit (geometry change)', () => {
    const edited = scene([
      { ...(saved.elements![0] as Record<string, unknown>), width: 200 },
    ])
    expect(normalizeScene(edited)).not.toBe(normalizeScene(saved))
  })

  it('still detects z-order changes via element order', () => {
    const reordered = scene([
      { ...(saved.elements![0] as Record<string, unknown>), index: 'c9' },
      { ...(saved.elements![0] as Record<string, unknown>), id: '2', index: 'a1' },
    ])
    expect(normalizeScene(reordered)).not.toBe(normalizeScene(saved))
  })
})
