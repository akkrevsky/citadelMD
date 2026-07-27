import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface Tab {
  id: string
  title: string
}

interface TabsContextType {
  pinnedTabs: Tab[]
  previewTab: Tab | null
  activeTabId: string | null
  /** Single-click: show a transient preview tab (replaces any existing preview). */
  openPreview: (tab: Tab) => void
  /** Double-click: pin a tab as persistent. */
  pinTab: (tab: Tab) => void
  /** Close a pinned (or preview) tab. */
  closeTab: (id: string) => void
  /** Close all tabs except the given one. */
  closeOthers: (id: string) => void
  /** Close all tabs to the left of the given one. */
  closeLeft: (id: string) => void
  /** Close all tabs to the right of the given one. */
  closeRight: (id: string) => void
  /** Set the active tab. */
  setActive: (id: string) => void
  /** Update tab title without changing pin/preview state. */
  updateTabTitle: (id: string, title: string) => void
  /** Tabs in display order: pinned tabs followed by the preview tab (if any). */
  allTabs: Tab[]
}

const STORAGE_KEY = 'citadelmd-pinned-tabs'

const TabsContext = createContext<TabsContextType | null>(null)

function loadPinned(): Tab[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
      .map((t) => ({ id: t.id, title: t.title }))
  } catch {
    return []
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [pinnedTabs, setPinnedTabs] = useState<Tab[]>(loadPinned)
  const [previewTab, setPreviewTab] = useState<Tab | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Persist pinned tabs
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedTabs))
    } catch {
      // ignore quota errors
    }
  }, [pinnedTabs])

  const openPreview = useCallback((tab: Tab) => {
    setPinnedTabs((pinned) => {
      // If the tab is already pinned, just activate it — no preview.
      if (pinned.some((t) => t.id === tab.id)) {
        setActiveTabId(tab.id)
        setPreviewTab(null)
        return pinned
      }
      setPreviewTab(tab)
      setActiveTabId(tab.id)
      return pinned
    })
  }, [])

  const pinTab = useCallback((tab: Tab) => {
    setPreviewTab((prev) => (prev?.id === tab.id ? null : prev))
    setPinnedTabs((pinned) => {
      if (pinned.some((t) => t.id === tab.id)) return pinned
      return [...pinned, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setPreviewTab((prev) => (prev?.id === id ? null : prev))
    setPinnedTabs((pinned) => {
      const idx = pinned.findIndex((t) => t.id === id)
      if (idx === -1) return pinned
      const next = pinned.filter((t) => t.id !== id)
      setActiveTabId((current) => {
        if (current !== id) return current
        // Activate neighbour: prefer the previous, else the next, else none
        const neighbour = next[idx - 1] ?? next[idx] ?? null
        return neighbour?.id ?? null
      })
      return next
    })
  }, [])

  const closeOthers = useCallback((id: string) => {
    setPreviewTab((prev) => (prev?.id === id ? prev : null))
    if (previewTab?.id !== id) setPreviewTab(null)
    setPinnedTabs((pinned) => {
      const kept = pinned.filter((t) => t.id === id)
      if (kept.length === 0) setActiveTabId(null)
      return kept
    })
    setActiveTabId(id)
  }, [previewTab])

  const closeLeft = useCallback((id: string) => {
    setPinnedTabs((pinned) => {
      const idx = pinned.findIndex((t) => t.id === id)
      if (idx <= 0) return pinned
      const kept = pinned.slice(idx)
      setActiveTabId(id)
      return kept
    })
  }, [setActiveTabId])

  const closeRight = useCallback((id: string) => {
    setPreviewTab(null)
    setPinnedTabs((pinned) => {
      const idx = pinned.findIndex((t) => t.id === id)
      if (idx === -1 || idx >= pinned.length - 1) return pinned
      const kept = pinned.slice(0, idx + 1)
      setActiveTabId(id)
      return kept
    })
  }, [setActiveTabId])

  const setActive = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const updateTabTitle = useCallback((id: string, title: string) => {
    setPinnedTabs((pinned) =>
      pinned.map((t) => (t.id === id ? { ...t, title } : t)),
    )
    setPreviewTab((prev) => (prev?.id === id ? { ...prev, title } : prev))
  }, [])

  const allTabs = previewTab ? [...pinnedTabs, previewTab] : pinnedTabs

  return (
    <TabsContext.Provider
      value={{ pinnedTabs, previewTab, activeTabId, openPreview, pinTab, closeTab, closeOthers, closeLeft, closeRight, setActive, updateTabTitle, allTabs }}
    >
      {children}
    </TabsContext.Provider>
  )
}

export function useTabs(): TabsContextType {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs must be used within TabsProvider')
  return ctx
}
