import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { api, type CurrentUser, type TreeItem } from '../api-client'
import { formatUpdatedAt } from '../utils/string'
import {
  hasUnsavedChanges,
  hasUncommittedChanges,
  onDocumentStateChange,
} from '../utils/unsaved'
import { TabsProvider, useTabs } from '../contexts/TabsContext'
import { FolderSettingsDialog } from '../components/FolderSettingsDialog'
import { AssetsPanel } from '../components/AssetsPanel'
import { TabContextMenu } from '../components/TabContextMenu'
import { findFirstDocument, collectDocumentIds, findFirstFolder } from '../utils/tree'
import logo from '../assets/logo.png'

const LAST_DOC_KEY = 'citadelmd-last-opened-id'

export interface DashboardContext {
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
  refreshTree: () => void
}

export default function DashboardPage() {
  return (
    <TabsProvider>
      <DashboardWithTabs />
    </TabsProvider>
  )
}

type SidebarView = 'folders' | 'assets'

function DashboardWithTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [treeLoading, setTreeLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<SidebarView>('folders')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    localStorage.getItem('citadelmd-sidebar-collapsed') === '1',
  )
  const [docStateTick, setDocStateTick] = useState(0)
  const [folderSettings, setFolderSettings] = useState<{
    id: string
    name: string
    mode: 'GIT' | 'SNAPSHOT'
  } | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingDoc, setCreatingDoc] = useState(false)
  const [creatingDiagram, setCreatingDiagram] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [createKind, setCreateKind] = useState<'MARKDOWN' | 'EXCALIDRAW'>('MARKDOWN')

  const {
    openPreview,
    pinTab,
    closeTab,
    activeTabId,
    pinnedTabs,
    previewTab,
    closeOthers,
    closeLeft,
    closeRight,
    setActive,
  } = useTabs()

  const activeDocId =
    location.pathname.match(/^\/documents\/([^/]+)\/edit$/)?.[1] ?? activeTabId

  const refreshTree = useCallback(() => {
    return api.getTree().then(setTree).catch(() => {})
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('citadelmd-sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    return onDocumentStateChange(() => setDocStateTick((n) => n + 1))
  }, [])

  useEffect(() => {
    api
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!user) return
    refreshTree().finally(() => setTreeLoading(false))
  }, [user, refreshTree])

  useEffect(() => {
    function onSaved() {
      refreshTree()
    }
    window.addEventListener('document-saved', onSaved)
    return () => window.removeEventListener('document-saved', onSaved)
  }, [refreshTree])

  // On app open at dashboard root, navigate to last or first document
  useEffect(() => {
    if (!user || treeLoading) return
    if (location.pathname !== '/') return

    const docIds = collectDocumentIds(tree)
    if (docIds.size === 0) return

    const lastDocId = localStorage.getItem(LAST_DOC_KEY)
    const targetId =
      lastDocId && docIds.has(lastDocId) ? lastDocId : findFirstDocument(tree)

    if (!targetId) return

    localStorage.setItem(LAST_DOC_KEY, targetId)
    navigate(`/documents/${targetId}/edit`, { replace: true, state: { preview: true } })
  }, [user, treeLoading, tree, location.pathname, navigate])

  function openDoc(item: TreeItem, pin: boolean) {
    localStorage.setItem(LAST_DOC_KEY, item.id)
    const path = `/documents/${item.id}/edit`
    const tab = { id: item.id, title: item.name }
    if (pin) {
      pinTab(tab)
      navigate(path, { state: { pin: true } })
    } else {
      openPreview(tab)
      setActive(item.id)
      navigate(path, { state: { preview: true } })
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    try {
      await api.createFolder(newFolderName.trim(), selectedFolderId)
      setNewFolderName('')
      setCreatingFolder(false)
      await refreshTree()
    } catch {
      // ignore
    }
  }

  async function handleCreateDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!newDocTitle.trim()) return
    const folderId = selectedFolderId ?? findFirstFolder(tree)
    if (!folderId) return
    try {
      const doc = await api.createDocument(folderId, newDocTitle.trim(), createKind)
      setNewDocTitle('')
      setCreatingDoc(false)
      setCreatingDiagram(false)
      setCreateKind('MARKDOWN')
      await refreshTree()
      pinTab({ id: doc.id, title: doc.title })
      navigate(`/documents/${doc.id}/edit`, { state: { pin: true } })
    } catch {
      // ignore
    }
  }


  function renderTree(items: TreeItem[], depth = 0, parentPath = '') {
    if (!Array.isArray(items)) return null
    return items.map((item) => {
      if (item.type === 'folder') {
        const folderPath = parentPath ? `${parentPath}/${item.name}` : item.name
        return (
          <div key={item.id}>
            <div
              className={`tree-item folder${selectedFolderId === item.id ? ' active' : ''}`}
              style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
              onClick={() => setSelectedFolderId(item.id)}
            >
              <span className="tree-item-label">{item.name}</span>
              <button
                className="tree-item-action"
                title="Folder settings"
                onClick={(e) => {
                  e.stopPropagation()
                  setFolderSettings({
                    id: item.id,
                    name: item.name,
                    mode: item.folderMode ?? 'GIT',
                  })
                }}
              >
                ⚙
              </button>
            </div>
            {item.children && renderTree(item.children, depth + 1, folderPath)}
          </div>
        )
      }

      const docPath = item.filePath ?? (parentPath ? `${parentPath}/${item.name}` : item.name)
      const isActive = activeDocId === item.id
      const unsaved = hasUnsavedChanges(item.id)
      const uncommitted = hasUncommittedChanges(item.id)
      void docStateTick

      return (
        <div
          key={item.id}
          className={`tree-item document${isActive ? ' active' : ''}${unsaved ? ' doc-unsaved' : ''}${uncommitted ? ' doc-uncommitted' : ''}`}
          style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        >
          <a
            href={`/documents/${item.id}/edit`}
            className="document-link"
            title={docPath}
            onClick={(e) => {
              e.preventDefault()
              openDoc(item, false)
            }}
            onDoubleClick={(e) => {
              e.preventDefault()
              openDoc(item, true)
            }}
          >
            <span className="document-name">
              {unsaved && <span className="doc-state-marker">*</span>}
              {item.kind === 'EXCALIDRAW' && <span className="doc-kind-icon" title="Diagram">◈ </span>}
              {item.name}
            </span>
            {item.updatedAt && (
              <span className="doc-created-at">{formatUpdatedAt(item.updatedAt)}</span>
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
      <button
        className="sidebar-toggle"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-expanded={!sidebarCollapsed}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
          <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
        </svg>
      </button>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src={logo} alt="citadelMD" className="sidebar-logo" />
            {!sidebarCollapsed && <h2>citadelMD</h2>}
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          {user.role === 'ADMIN' && (
            <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>
              Admin Users
            </NavLink>
          )}
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
            Profile &amp; Settings
          </NavLink>

          <div className="tree-section">
            <div className="sidebar-view-tabs">
              <button
                type="button"
                className={sidebarView === 'folders' ? 'active' : ''}
                onClick={() => setSidebarView('folders')}
              >
                Folders
              </button>
              <button
                type="button"
                className={sidebarView === 'assets' ? 'active' : ''}
                onClick={() => setSidebarView('assets')}
              >
                Assets
              </button>
            </div>

            {sidebarView === 'folders' ? (
              <>
                <div className="tree-actions">
                  <button
                    className="btn btn-sm btn-primary tree-action-btn"
                    onClick={() => {
                      if (creatingDoc && createKind === 'MARKDOWN') {
                        setCreatingDoc(false)
                      } else {
                        setCreateKind('MARKDOWN')
                        setCreatingDoc(true)
                        setCreatingDiagram(false)
                      }
                    }}
                  >
                    + Note
                  </button>
                  <button
                    className="btn btn-sm tree-action-btn"
                    onClick={() => {
                      if (creatingDiagram) {
                        setCreatingDiagram(false)
                        setCreatingDoc(false)
                      } else {
                        setCreateKind('EXCALIDRAW')
                        setCreatingDiagram(true)
                        setCreatingDoc(true)
                      }
                    }}
                  >
                    + Diagram
                  </button>
                  <button
                    className="btn btn-sm tree-action-btn"
                    onClick={() => setCreatingFolder((v) => !v)}
                  >
                    + Folder
                  </button>
                </div>
                {creatingFolder && (
                  <form className="inline-form tree-inline-form" onSubmit={handleCreateFolder}>
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      autoFocus
                    />
                    <button type="submit" className="btn btn-sm btn-primary">Add</button>
                  </form>
                )}
                {(creatingDoc || creatingDiagram) && (
                  <form className="inline-form tree-inline-form" onSubmit={handleCreateDoc}>
                    <input
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                      placeholder={createKind === 'EXCALIDRAW' ? 'Diagram title' : 'Note title'}
                      autoFocus
                    />
                    <button type="submit" className="btn btn-sm btn-primary">Add</button>
                  </form>
                )}
                {treeLoading ? (
                  <div className="tree-empty">Loading...</div>
                ) : tree.length === 0 ? (
                  <div className="tree-empty">No folders yet</div>
                ) : (
                  renderTree(tree)
                )}
              </>
            ) : (
              <AssetsPanel />
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

      <main className="main-area">
        <TabBarMain
          pinnedTabs={pinnedTabs}
          previewTab={previewTab}
          activeTabId={activeDocId}
          onSelect={(id) => navigate(`/documents/${id}/edit`, { state: { pin: true } })}
          onClose={(id) => closeTab(id)}
          onCloseOthers={closeOthers}
          onCloseLeft={closeLeft}
          onCloseRight={closeRight}
        />
        <Outlet context={{ selectedFolderId, setSelectedFolderId, refreshTree } satisfies DashboardContext} />
      </main>

      {folderSettings && (
        <FolderSettingsDialog
          folderId={folderSettings.id}
          folderName={folderSettings.name}
          currentMode={folderSettings.mode}
          onClose={() => setFolderSettings(null)}
          onSaved={(mode) => {
            setFolderSettings(null)
            refreshTree()
            void mode
          }}
        />
      )}
    </div>
  )
}

function TabBarMain({
  pinnedTabs,
  previewTab,
  activeTabId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
}: {
  pinnedTabs: { id: string; title: string }[]
  previewTab: { id: string; title: string } | null
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseLeft: (id: string) => void
  onCloseRight: (id: string) => void
}) {
  const [docStateTick, setDocStateTick] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  useEffect(() => onDocumentStateChange(() => setDocStateTick((n) => n + 1)), [])
  void docStateTick

  const displayTabs = pinnedTabs
  const showPreviewActive = previewTab && activeTabId === previewTab.id && !pinnedTabs.some((t) => t.id === previewTab.id)

  if (displayTabs.length === 0 && !showPreviewActive) return null

  return (
    <div className="tab-bar">
      {displayTabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const unsaved = hasUnsavedChanges(tab.id)
        return (
          <div
            key={tab.id}
            className={`tab-item${isActive ? ' active' : ''}`}
            onClick={() => onSelect(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id })
            }}
          >
            <span className="tab-label">
              {unsaved && <span className="unsaved-star">*</span>}
              {tab.title || tab.id.slice(0, 8)}
            </span>
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
          </div>
        )
      })}
      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onCloseOthers={() => onCloseOthers(menu.tabId)}
          onCloseLeft={() => onCloseLeft(menu.tabId)}
          onCloseRight={() => onCloseRight(menu.tabId)}
        />
      )}
    </div>
  )
}
