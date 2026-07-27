import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { api, type CurrentUser, type TreeItem } from '../api-client'
import { formatCreatedAt } from '../utils/format'

export interface DashboardContext {
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [treeLoading, setTreeLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

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
          <Link
            to={`/documents/${item.id}/edit`}
            className="document-link"
          >
            <span className="document-name">{item.name}</span>
            {item.createdAt && (
              <span className="doc-created-at">{formatCreatedAt(item.createdAt)}</span>
            )}
          </Link>
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
    <div className="dashboard-layout">
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
            Profile
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

      {/* Main content */}
      <main className="main-area">
        <Outlet context={{ selectedFolderId, setSelectedFolderId } satisfies DashboardContext} />
      </main>
    </div>
  )
}
