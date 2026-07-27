import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { api, type CurrentUser, type TreeItem } from '../api-client'
import { formatCreatedAt } from '../utils/format'
import { TabsProvider, useTabs } from '../contexts/TabsContext'
import { TabBar } from '../components/TabBar'

export interface DashboardContext {
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
}

/** Public wrapper for the dashboard — provides TabsContext. */
export default function DashboardPage() {
  return (
    <TabsProvider>
      <DashboardWithTabs />
    </TabsProvider>
  )
}

/** Internal component — has access to both sidebar state and tabs. */
function DashboardWithTabs() {
  const navigate = useNavigate()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [treeLoading, setTreeLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    localStorage.getItem('citadelmd-sidebar-collapsed') === '1',
  )

  const { openPreview, pinTab, closeTab, allTabs, activeTabId, pinnedTabs, previewTab } = useTabs()

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('citadelmd-sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user)
      })
      .catch(() => {
        navigate('/login', { replace: true })
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!user) return
    api
      .getTree()
      .then(setTree)
      .catch(() => {
        // tree unavailable is not fatal
      })
      .finally(() => setTreeLoading(false))
  }, [user])

  function openDoc(item: TreeItem, pin: boolean) {
    const path = `/documents/${item.id}/edit`
    const tab = { id: item.id, title: item.name }
    if (pin) {
      pinTab(tab)
    } else {
      openPreview(tab)
    }
    navigate(path)
  }

  function renderTree(items: TreeItem[], depth = 0) {
    if (!Array.isArray(items)) return null
    return items.map((item) => {
      if (item.type === 'folder') {
        return (
          <div key={item.id}>
            <div
              className={`tree-item folder${selectedFolderId === item.id ? ' active' : ''}`}
              style={{ paddingLeft: `${1 + depth * 1}rem` }}
              onClick={() => setSelectedFolderId(item.id)}
            >
              {item.name}
            </div>
            {item.children && renderTree(item.children, depth + 1)}
          </div>
        )
      }
      return (
        <div
          key={item.id}
          className="tree-item document"
          style={{ paddingLeft: `${1 + depth * 1}rem` }}
        >
          <a
            href={`/documents/${item.id}/edit`}
            className="document-link"
            onClick={(e) => {
              e.preventDefault()
              openDoc(item, false) // single click → preview
            }}
            onDoubleClick={() => {
              openDoc(item, true) // double click → pin
            }}
          >
            <span className="document-name">{item.name}</span>
            {item.createdAt && (
              <span className="doc-created-at">{formatCreatedAt(item.createdAt)}</span>
            )}
          </a>
        </div>
      )
    })
  }

  async function handleLogout() {
    await api.logout()
    navigate('/login', { replace: true })
  }

  if (loading) return null
  if (!user) return null

  return (
    <div className={`dashboard-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Toggle button — visible in both states */}
      <button
        className="sidebar-toggle"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-expanded={!sidebarCollapsed}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
        </svg>
      </button>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>citadelMD</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          {user.role === 'ADMIN' && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              Admin Users
            </NavLink>
          )}
          <NavLink
            to="/profile"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            Profile &amp; Settings
          </NavLink>

          {/* Folder tree */}
          <div className="tree-section">
            <div className="tree-section-title">Folders</div>
            <button className="btn btn-sm btn-primary tree-action-btn" onClick={() => navigate('/')}>
              + New Document
            </button>
            {treeLoading ? (
              <div className="tree-empty">Loading...</div>
            ) : tree.length === 0 ? (
              <div className="tree-empty">No folders yet</div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            {user.displayName ?? user.login} ({user.role.toLowerCase()})
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content area with tab bar */}
      <main className="main-area">
        <TabBarMain
          pinnedTabs={pinnedTabs}
          previewTabId={previewTab?.id ?? null}
          activeTabId={activeTabId}
          onSelect={(id) => navigate(`/documents/${id}/edit`)}
          onClose={(id) => closeTab(id)}
          onPin={(id) => pinTab({ id, title: previewTab?.title ?? id })}
        />
        <Outlet context={{ selectedFolderId, setSelectedFolderId } satisfies DashboardContext} />
      </main>
    </div>
  )
}

/**
 * Tab bar above the document content.
 * Pinned tabs show with a close button. Preview tabs are italicised.
 */
function TabBarMain({
  pinnedTabs,
  previewTabId,
  activeTabId,
  onSelect,
  onClose,
  onPin,
}: {
  pinnedTabs: { id: string; title: string }[]
  previewTabId: string | null
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onPin: (id: string) => void
}) {
  const allTabs = [...pinnedTabs, ...(previewTabId ? [{ id: previewTabId, title: '' }] : [])]
  if (allTabs.length === 0) return null

  return (
    <div className="tab-bar">
      {allTabs.map((tab) => {
        const isPreview = previewTabId === tab.id
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={`tab-item${isActive ? ' active' : ''}${isPreview ? ' preview' : ''}`}
            onClick={() => onSelect(tab.id)}
            title={isPreview ? 'Double-click to pin' : ''}
            onDoubleClick={() => {
              if (isPreview) onPin(tab.id)
            }}
          >
            <span className="tab-label">{tab.title || tab.id.slice(0, 8)}</span>
            {/* Only pinned tabs get a close button */}
            {pinnedTabs.some((t) => t.id === tab.id) && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                title="Close"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                  <path d="M4.72 4.72a.75.75 0 011.06 0L8 6.94l2.22-2.22a.75.75 0 111.06 1.06L9.06 8l2.22 2.22a.75.75 0 11-1.06 1.06L8 9.06l-2.22 2.22a.75.75 0 01-1.06-1.06L6.94 8 4.72 5.78a.75.75 0 010-1.06z"/>
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
