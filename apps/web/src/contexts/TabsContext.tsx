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
  /** Set the active tab. */
  setActive: (id: string) => void
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

  const setActive = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const allTabs = previewTab ? [...pinnedTabs, previewTab] : pinnedTabs

  return (
    <TabsContext.Provider
      value={{ pinnedTabs, previewTab, activeTabId, openPreview, pinTab, closeTab, setActive, allTabs }}
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
