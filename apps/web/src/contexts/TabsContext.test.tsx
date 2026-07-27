import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { TabsProvider, useTabs, type Tab } from './TabsContext'

const wrapper = ({ children }: { children: React.ReactNode }) => <TabsProvider>{children}</TabsProvider>

function renderTabs() {
  return renderHook(() => useTabs(), { wrapper })
}

const doc = (id: string, title = id): Tab => ({ id, title })

describe('TabsContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with no tabs and no preview', () => {
    const { result } = renderTabs()
    expect(result.current.pinnedTabs).toEqual([])
    expect(result.current.previewTab).toBeNull()
    expect(result.current.activeTabId).toBeNull()
  })

  it('openPreview sets a single transient preview tab and makes it active', () => {
    const { result } = renderTabs()
    act(() => result.current.openPreview(doc('a', 'Doc A')))

    expect(result.current.previewTab).toEqual(doc('a', 'Doc A'))
    expect(result.current.pinnedTabs).toEqual([])
    expect(result.current.activeTabId).toBe('a')
  })

  it('openPreview replaces the previous preview (VS Code semantics)', () => {
    const { result } = renderTabs()
    act(() => result.current.openPreview(doc('a')))
    act(() => result.current.openPreview(doc('b')))

    expect(result.current.previewTab).toEqual(doc('b'))
    expect(result.current.activeTabId).toBe('b')
  })

  it('openPreview on an already-pinned tab does not create a preview', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'Doc A')))
    act(() => result.current.openPreview(doc('a', 'Doc A')))

    expect(result.current.previewTab).toBeNull()
    expect(result.current.activeTabId).toBe('a')
  })

  it('pinTab moves a preview tab into pinned and clears preview', () => {
    const { result } = renderTabs()
    act(() => result.current.openPreview(doc('a', 'Doc A')))
    act(() => result.current.pinTab(doc('a', 'Doc A')))

    expect(result.current.previewTab).toBeNull()
    expect(result.current.pinnedTabs).toEqual([doc('a', 'Doc A')])
    expect(result.current.activeTabId).toBe('a')
  })

  it('pinTab on a new tab (no preview) adds it to pinned', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'Doc A')))

    expect(result.current.pinnedTabs).toEqual([doc('a', 'Doc A')])
    expect(result.current.previewTab).toBeNull()
  })

  it('pinTab is idempotent (no duplicate pinned tabs)', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'Doc A')))
    act(() => result.current.pinTab(doc('a', 'Doc A')))

    expect(result.current.pinnedTabs).toEqual([doc('a', 'Doc A')])
  })

  it('closeTab removes a pinned tab and activates the neighbour', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'A')))
    act(() => result.current.pinTab(doc('b', 'B')))
    act(() => result.current.pinTab(doc('c', 'C')))
    // active is 'c' (last pinned). Close 'c' → activate 'b'.
    act(() => result.current.closeTab('c'))

    expect(result.current.pinnedTabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(result.current.activeTabId).toBe('b')
  })

  it('closeTab activates the previous neighbour when closing the first tab', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'A')))
    act(() => result.current.pinTab(doc('b', 'B')))
    act(() => result.current.setActive('a'))
    act(() => result.current.closeTab('a'))

    expect(result.current.pinnedTabs.map((t) => t.id)).toEqual(['b'])
    expect(result.current.activeTabId).toBe('b')
  })

  it('closeTab with no remaining tabs clears activeTabId', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'A')))
    act(() => result.current.closeTab('a'))

    expect(result.current.pinnedTabs).toEqual([])
    expect(result.current.activeTabId).toBeNull()
  })

  it('closing the preview tab clears it', () => {
    const { result } = renderTabs()
    act(() => result.current.openPreview(doc('a', 'A')))
    act(() => result.current.closeTab('a'))

    expect(result.current.previewTab).toBeNull()
  })

  it('persists pinned tabs to localStorage', () => {
    const { result } = renderTabs()
    act(() => result.current.pinTab(doc('a', 'A')))
    act(() => result.current.pinTab(doc('b', 'B')))

    const stored = JSON.parse(localStorage.getItem('citadelmd-pinned-tabs') ?? '[]')
    expect(stored.map((t: Tab) => t.id)).toEqual(['a', 'b'])
  })

  it('restores pinned tabs from localStorage on mount', () => {
    localStorage.setItem('citadelmd-pinned-tabs', JSON.stringify([doc('a', 'A')]))
    const { result } = renderTabs()

    expect(result.current.pinnedTabs.map((t) => t.id)).toEqual(['a'])
  })
})
