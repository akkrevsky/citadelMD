import { useEffect, useState, useCallback, useRef } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { api, type CurrentUser, type TreeItem } from '../api-client'
import { ToastContainer, createToast, type ToastData } from '../components/Toast.js'
import { isImportableFile } from '../utils/importFile.js'
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
import { MoveDocumentDialog } from '../components/MoveDocumentDialog'
import { ConfirmModal } from '../components/ConfirmModal'
import { TreeContextMenu, type TreeMenuItem } from '../components/TreeContextMenu'
import {
  findFirstDocument,
  collectDocumentIds,
  findFirstFolder,
  collectSubtreeDocumentIds,
} from '../utils/tree'
import { IconChevronRight, IconFolder, IconFile } from '../components/icons'
import logo from '../assets/logo.png'
import excalidrawLogo from '../assets/excalidraw-logo.png'

const LAST_DOC_KEY = 'citadelmd-last-opened-id'

// OpenViking-style tree metrics: per-level indent, base row padding, guide line offset
const TREE_INDENT = 16
const TREE_ROW_PADDING = 6
const TREE_GUIDE_OFFSET = 8

const COLLAPSED_FOLDERS_KEY = 'citadelmd-sidebar-collapsed-folders'

// VS Code-like vertical indent guides running through the subtree of each node
function TreeIndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null
  return (
    <div className="tree-guides" aria-hidden="true">
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          style={{ left: `${TREE_ROW_PADDING + i * TREE_INDENT + TREE_GUIDE_OFFSET}px` }}
        />
      ))}
    </div>
  )
}

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

type CreateMode = null | 'folder' | 'note' | 'diagram'

function DashboardWithTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [treeLoading, setTreeLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<SidebarView>('folders')
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem('citadelmd-sidebar-collapsed')
    if (stored !== null) return stored === '1'
    // Default to collapsed on narrow screens so the editor keeps its space
    try {
      return window.matchMedia('(max-width: 768px)').matches
    } catch {
      return false
    }
  })
  const [docStateTick, setDocStateTick] = useState(0)
  const [folderSettings, setFolderSettings] = useState<{
    id: string
    name: string
    mode: 'GIT' | 'SNAPSHOT'
  } | null>(null)
  const [createMode, setCreateMode] = useState<CreateMode>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [newDocTitle, setNewDocTitle] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_FOLDERS_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      // fall through to the default
    }
    return new Set()
  })
  const [navScrolling, setNavScrolling] = useState(false)
  const navScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedFolderRowRef = useRef<HTMLDivElement | null>(null)
  const [treeMenu, setTreeMenu] = useState<{ x: number; y: number; item: TreeItem } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const cancelRenameRef = useRef(false)
  const [moveDoc, setMoveDoc] = useState<{ id: string; title: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
    kind: 'folder' | 'document'
  } | null>(null)
  const dragDocRef = useRef<{ id: string; currentFolderId: string | null } | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

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
    updateTabTitle,
    reorderTabs,
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

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function expandFolder(id: string) {
    setCollapsedFolders((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function startCreate(mode: 'note' | 'diagram' | 'folder', folderId: string) {
    expandFolder(folderId)
    setSelectedFolderId(folderId)
    setCreateMode(mode)
  }

  async function commitRename(item: TreeItem, raw: string) {
    const name = raw.trim()
    if (!name || name === item.name) {
      setRenaming(null)
      return
    }
    try {
      if (item.type === 'folder') {
        await api.renameFolder(item.id, { name })
      } else {
        await api.updateDocument(item.id, { title: name })
        updateTabTitle(item.id, name)
      }
      await refreshTree()
    } catch {
      // silent revert, matching the tab-bar rename behavior
    }
    setRenaming(null)
  }

  async function handleExport(item: TreeItem) {
    try {
      const content = await api.exportDocument(item.id)
      const isDiagram = item.kind === 'EXCALIDRAW'
      const blob = new Blob([content], {
        type: isDiagram ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.name}.${isDiagram ? 'excalidraw' : 'md'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }

  async function handleDeleteDocument(id: string) {
    try {
      await api.deleteDocument(id)
    } catch {
      return
    }
    closeTab(id)
    await refreshTree()
    if (activeDocId === id) navigate('/')
  }

  async function handleImportFiles(files: FileList | File[], folderId: string) {
    for (const file of Array.from(files)) {
      if (!isImportableFile(file)) {
        createToast(
          setToasts,
          `Only .md and .txt files can be imported as documents (${file.name})`,
          'error',
        )
        continue
      }
      try {
        const doc = await api.importDocument(folderId, file)
        await refreshTree()
        pinTab({ id: doc.id, title: doc.title })
        navigate(`/documents/${doc.id}/edit`, { state: { pin: true } })
        createToast(setToasts, `Imported ${doc.title}`, 'success')
      } catch (err) {
        createToast(
          setToasts,
          `Import failed for ${file.name}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
          'error',
        )
      }
    }
  }

  async function handleMoveDocument(
    docId: string,
    currentFolderId: string | null,
    targetFolderId: string,
  ) {
    if (currentFolderId === targetFolderId) return
    expandFolder(targetFolderId)
    try {
      await api.moveDocument(docId, targetFolderId)
      await refreshTree()
    } catch {
      // ignore
    }
  }

  async function handleDeleteFolder(id: string) {
    const affected = collectSubtreeDocumentIds(tree, id)
    try {
      await api.deleteFolder(id)
    } catch {
      return
    }
    for (const docId of affected) closeTab(docId)
    await refreshTree()
    if (activeDocId && affected.has(activeDocId)) navigate('/')
  }

  function buildMenuItems(item: TreeItem): TreeMenuItem[] {
    if (item.type === 'folder') {
      const isRoot = item.folderGitPath === ''
      const items: TreeMenuItem[] = [
        { label: 'New note', onSelect: () => startCreate('note', item.id) },
        { label: 'New diagram', onSelect: () => startCreate('diagram', item.id) },
        { label: 'New subfolder', onSelect: () => startCreate('folder', item.id) },
      ]
      if (!isRoot) {
        items.push(
          { separator: true },
          { label: 'Rename', onSelect: () => setRenaming({ id: item.id, name: item.name }) },
          {
            label: 'Settings',
            onSelect: () =>
              setFolderSettings({ id: item.id, name: item.name, mode: item.folderMode ?? 'GIT' }),
          },
          {
            label: 'Delete',
            danger: true,
            onSelect: () => setDeleteTarget({ id: item.id, title: item.name, kind: 'folder' }),
          },
        )
      } else {
        items.push(
          { separator: true },
          {
            label: 'Settings',
            onSelect: () =>
              setFolderSettings({ id: item.id, name: item.name, mode: item.folderMode ?? 'GIT' }),
          },
        )
      }
      return items
    }

    return [
      { label: 'Open', onSelect: () => openDoc(item, false) },
      { label: 'Rename', onSelect: () => setRenaming({ id: item.id, name: item.name }) },
      { label: 'Move to folder', onSelect: () => setMoveDoc({ id: item.id, title: item.name }) },
      { label: 'Export', onSelect: () => void handleExport(item) },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        onSelect: () => setDeleteTarget({ id: item.id, title: item.name, kind: 'document' }),
      },
    ]
  }

  function onNavScroll() {
    setNavScrolling(true)
    if (navScrollTimer.current) clearTimeout(navScrollTimer.current)
    navScrollTimer.current = setTimeout(() => setNavScrolling(false), 700)
  }

  // Keep the selected folder row in view, like OpenViking's scrollIntoView
  useEffect(() => {
    if (!selectedFolderId) return
    const frame = requestAnimationFrame(() => {
      selectedFolderRowRef.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedFolderId])

  useEffect(() => {
    return onDocumentStateChange(() => setDocStateTick((n) => n + 1))
  }, [])

  useEffect(() => {
    return () => {
      if (navScrollTimer.current) clearTimeout(navScrollTimer.current)
    }
  }, [])

  // Drop collapsed ids for folders that no longer exist
  useEffect(() => {
    if (tree.length === 0) return
    const ids = new Set<string>()
    function walk(nodes: TreeItem[]) {
      for (const node of nodes) {
        if (node.type === 'folder') ids.add(node.id)
        if (node.children) walk(node.children)
      }
    }
    walk(tree)
    setCollapsedFolders((prev) => {
      const stale = [...prev].filter((id) => !ids.has(id))
      if (stale.length === 0) return prev
      const next = new Set(prev)
      for (const id of stale) next.delete(id)
      localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]))
      return next
    })
  }, [tree])

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

  function toggleCreateMode(mode: CreateMode) {
    setCreateMode((prev) => {
      const next = prev === mode ? null : mode
      if (next === 'diagram' && !newDocTitle.trim()) {
        setNewDocTitle('Diagram')
      }
      return next
    })
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    try {
      await api.createFolder(newFolderName.trim(), selectedFolderId)
      setNewFolderName('')
      setCreateMode(null)
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
    const kind = createMode === 'diagram' ? 'EXCALIDRAW' : 'MARKDOWN'
    try {
      const doc = await api.createDocument(folderId, newDocTitle.trim(), kind)
      setNewDocTitle('')
      setCreateMode(null)
      await refreshTree()
      pinTab({ id: doc.id, title: doc.title })
      navigate(`/documents/${doc.id}/edit`, { state: { pin: true } })
    } catch {
      // ignore
    }
  }


  function renameInput(item: TreeItem) {
    return (
      <input
        className="tree-rename-input"
        defaultValue={item.name}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            cancelRenameRef.current = true
            setRenaming(null)
          }
        }}
        onBlur={(e) => {
          if (cancelRenameRef.current) {
            cancelRenameRef.current = false
            return
          }
          void commitRename(item, e.currentTarget.value)
        }}
      />
    )
  }

  function renderTree(items: TreeItem[], depth = 0, parentPath = '') {
    if (!Array.isArray(items)) return null
    return items.map((item) => {
      if (item.type === 'folder') {
        const folderPath = parentPath ? `${parentPath}/${item.name}` : item.name
        const isOpen = !collapsedFolders.has(item.id)
        const isSelected = selectedFolderId === item.id
        return (
          <div key={item.id} className="tree-node">
            <TreeIndentGuides depth={depth} />
            <div
              ref={isSelected ? selectedFolderRowRef : undefined}
              className={`tree-row folder${isSelected ? ' active' : ''}${dragOverFolderId === item.id ? ' drag-over' : ''}`}
              style={{ paddingLeft: `${TREE_ROW_PADDING + depth * TREE_INDENT}px` }}
              onClick={() => {
                setSelectedFolderId(item.id)
                if (!isOpen) toggleFolder(item.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setTreeMenu({ x: e.clientX, y: e.clientY, item })
              }}
              onDragOver={(e) => {
                if (!dragDocRef.current) {
                  if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setDragOverFolderId(item.id)
                  }
                  return
                }
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverFolderId(item.id)
              }}
              onDragLeave={() =>
                setDragOverFolderId((cur) => (cur === item.id ? null : cur))
              }
              onDrop={(e) => {
                e.preventDefault()
                const drag = dragDocRef.current
                dragDocRef.current = null
                setDragOverFolderId(null)
                if (drag) {
                  void handleMoveDocument(drag.id, drag.currentFolderId, item.id)
                } else if (e.dataTransfer.files.length > 0) {
                  void handleImportFiles(e.dataTransfer.files, item.id)
                }
              }}
            >
              <button
                type="button"
                className="tree-chevron"
                title={isOpen ? 'Collapse' : 'Expand'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolder(item.id)
                }}
              >
                <IconChevronRight className={isOpen ? 'open' : ''} />
              </button>
              <IconFolder className={`tree-icon${isOpen ? ' open' : ''}`} />
              {renaming?.id === item.id ? (
                renameInput(item)
              ) : (
                <span className="tree-row-label">{item.name}</span>
              )}
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
            {isOpen && item.children ? renderTree(item.children, depth + 1, folderPath) : null}
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
          className={`tree-node${isActive ? ' doc-active' : ''}`}
        >
          <TreeIndentGuides depth={depth} />
          <a
            href={`/documents/${item.id}/edit`}
            className={`tree-row document${unsaved ? ' doc-unsaved' : ''}${uncommitted ? ' doc-uncommitted' : ''}`}
            style={{ paddingLeft: `${TREE_ROW_PADDING + depth * TREE_INDENT}px` }}
            title={docPath}
            onClick={(e) => {
              e.preventDefault()
              openDoc(item, false)
            }}
            onDoubleClick={(e) => {
              e.preventDefault()
              openDoc(item, true)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setTreeMenu({ x: e.clientX, y: e.clientY, item })
            }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', item.id)
              // Suppress the native anchor link-drag, which would navigate on stray drops
              e.dataTransfer.setData('text/uri-list', '')
              dragDocRef.current = { id: item.id, currentFolderId: item.parentId ?? null }
            }}
            onDragEnd={() => {
              dragDocRef.current = null
              setDragOverFolderId(null)
            }}
          >
            <span className="tree-chevron-spacer" aria-hidden="true" />
            {item.kind === 'EXCALIDRAW' ? (
              <img
                className="doc-kind-icon"
                src={excalidrawLogo}
                alt="Diagram"
                title="Diagram"
              />
            ) : (
              <IconFile className="tree-icon file" />
            )}
            {renaming?.id === item.id ? (
              renameInput(item)
            ) : (
              <span className="tree-row-label">
                {unsaved && <span className="doc-state-marker">*</span>}
                {item.name}
              </span>
            )}
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

        <nav
          className="sidebar-nav scrollbar-fade"
          data-scrolling={navScrolling ? 'true' : undefined}
          onScroll={onNavScroll}
        >
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
                    className={`btn btn-sm tree-action-btn${createMode === 'note' ? ' btn-primary' : ''}`}
                    onClick={() => toggleCreateMode('note')}
                  >
                    + Note
                  </button>
                  <button
                    className={`btn btn-sm tree-action-btn${createMode === 'diagram' ? ' btn-primary' : ''}`}
                    onClick={() => toggleCreateMode('diagram')}
                  >
                    + Diagram
                  </button>
                  <button
                    className={`btn btn-sm tree-action-btn${createMode === 'folder' ? ' btn-primary' : ''}`}
                    onClick={() => toggleCreateMode('folder')}
                  >
                    + Folder
                  </button>
                </div>
                {createMode === 'folder' && (
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
                {(createMode === 'note' || createMode === 'diagram') && (
                  <form className="inline-form tree-inline-form" onSubmit={handleCreateDoc}>
                    <input
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                      placeholder={createMode === 'diagram' ? 'Diagram title' : 'Note title'}
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
          tree={tree}
          onSelect={(id) => navigate(`/documents/${id}/edit`, { state: { pin: true } })}
          onClose={(id) => closeTab(id)}
          onCloseOthers={closeOthers}
          onCloseLeft={closeLeft}
          onCloseRight={closeRight}
          onReorder={reorderTabs}
          onRename={(id, title) => updateTabTitle(id, title)}
          onRefreshTree={refreshTree}
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

      {treeMenu && (
        <TreeContextMenu
          x={treeMenu.x}
          y={treeMenu.y}
          items={buildMenuItems(treeMenu.item)}
          onClose={() => setTreeMenu(null)}
        />
      )}

      {moveDoc && (
        <MoveDocumentDialog
          documentTitle={moveDoc.title}
          tree={tree}
          onClose={() => setMoveDoc(null)}
          onMove={(folderId) => {
            void api
              .moveDocument(moveDoc.id, folderId)
              .then(() => refreshTree())
              .catch(() => {})
              .finally(() => setMoveDoc(null))
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={deleteTarget.kind === 'folder' ? 'Delete folder' : 'Delete document'}
          message={
            deleteTarget.kind === 'folder'
              ? `Delete folder "${deleteTarget.title}" and all its contents permanently?`
              : `Delete "${deleteTarget.title}" permanently?`
          }
          confirmLabel="Delete"
          onConfirm={() => {
            if (deleteTarget.kind === 'folder') void handleDeleteFolder(deleteTarget.id)
            else void handleDeleteDocument(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function TabBarMain({
  pinnedTabs,
  previewTab,
  activeTabId,
  tree,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onReorder,
  onRename,
  onRefreshTree,
}: {
  pinnedTabs: { id: string; title: string }[]
  previewTab: { id: string; title: string } | null
  activeTabId: string | null
  tree: TreeItem[]
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseLeft: (id: string) => void
  onCloseRight: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRename: (id: string, title: string) => void
  onRefreshTree: () => void
}) {
  const navigate = useNavigate()
  const [docStateTick, setDocStateTick] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string; title: string } | null>(null)
  const [moveTab, setMoveTab] = useState<{ id: string; title: string } | null>(null)
  const [deleteTab, setDeleteTab] = useState<{ id: string; title: string } | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => onDocumentStateChange(() => setDocStateTick((n) => n + 1)), [])
  void docStateTick

  const displayTabs = pinnedTabs
  const showPreviewActive = previewTab && activeTabId === previewTab.id && !pinnedTabs.some((t) => t.id === previewTab.id)

  async function handleRenameTab(tabId: string, currentTitle: string) {
    const next = window.prompt('Rename document', currentTitle)
    if (!next || !next.trim() || next.trim() === currentTitle) return
    try {
      await api.updateDocument(tabId, { title: next.trim() })
      onRename(tabId, next.trim())
      onRefreshTree()
    } catch {
      // ignore
    }
  }

  async function handleDeleteTab(tabId: string) {
    try {
      await api.deleteDocument(tabId)
      onClose(tabId)
      onRefreshTree()
      if (activeTabId === tabId) {
        navigate('/')
      }
    } catch {
      // ignore
    }
  }

  async function handleMoveTab(tabId: string, folderId: string) {
    try {
      await api.moveDocument(tabId, folderId)
      onRefreshTree()
      setMoveTab(null)
    } catch {
      // ignore
    }
  }

  if (displayTabs.length === 0 && !showPreviewActive) return null

  return (
    <>
      <div className="tab-bar">
        {displayTabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const unsaved = hasUnsavedChanges(tab.id)
          const isDragOver = dragOverIndex === index && dragIndexRef.current !== index
          return (
            <div
              key={tab.id}
              className={`tab-item${isActive ? ' active' : ''}${isDragOver ? ' tab-drag-over' : ''}`}
              draggable
              onClick={() => onSelect(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, title: tab.title })
              }}
              onDragStart={(e) => {
                dragIndexRef.current = index
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', tab.id)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverIndex(index)
              }}
              onDragLeave={() => {
                if (dragOverIndex === index) setDragOverIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragIndexRef.current
                if (from !== null && from !== index) {
                  onReorder(from, index)
                }
                dragIndexRef.current = null
                setDragOverIndex(null)
              }}
              onDragEnd={() => {
                dragIndexRef.current = null
                setDragOverIndex(null)
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
            onRename={() => void handleRenameTab(menu.tabId, menu.title)}
            onDelete={() => setDeleteTab({ id: menu.tabId, title: menu.title })}
            onMove={() => setMoveTab({ id: menu.tabId, title: menu.title })}
            onCloseOthers={() => onCloseOthers(menu.tabId)}
            onCloseLeft={() => onCloseLeft(menu.tabId)}
            onCloseRight={() => onCloseRight(menu.tabId)}
          />
        )}
      </div>

      {moveTab && (
        <MoveDocumentDialog
          documentTitle={moveTab.title}
          tree={tree}
          onClose={() => setMoveTab(null)}
          onMove={(folderId) => void handleMoveTab(moveTab.id, folderId)}
        />
      )}

      {deleteTab && (
        <ConfirmModal
          title="Delete document"
          message={`Delete "${deleteTab.title}" permanently?`}
          confirmLabel="Delete"
          onConfirm={() => {
            void handleDeleteTab(deleteTab.id)
            setDeleteTab(null)
          }}
          onCancel={() => setDeleteTab(null)}
        />
      )}
    </>
  )
}
