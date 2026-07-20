import { useEffect, useState, type FormEvent } from 'react'
import { api, type UserRecord } from '../api-client'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create user form
  const [showCreate, setShowCreate] = useState(false)
  const [newLogin, setNewLogin] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'EDITOR' | 'VIEWER'>('VIEWER')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  function loadUsers() {
    setLoading(true)
    setError('')
    api
      .listUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    try {
      await api.createUser({
        login: newLogin,
        password: newPassword,
        role: newRole,
        displayName: newDisplayName || undefined,
      })
      setShowCreate(false)
      setNewLogin('')
      setNewPassword('')
      setNewRole('VIEWER')
      setNewDisplayName('')
      loadUsers()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm('Deactivate this user?')) return

    try {
      await api.deactivateUser(id)
      loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user')
    }
  }

  function roleBadge(role: string) {
    const cls =
      role === 'ADMIN'
        ? 'badge-admin'
        : role === 'EDITOR'
          ? 'badge-editor'
          : 'badge-viewer'
    return <span className={`badge ${cls}`}>{role}</span>
  }

  return (
    <div className="admin-users-page">
      <div className="main-header">
        <h1>Admin Users</h1>
      </div>
      <div className="main-content">
        <div className="page-header">
          <div />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'Create user'}
          </button>
        </div>

        {showCreate && (
          <div className="card">
            <h3>Create user</h3>
            {createError && <div className="error-message">{createError}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="new-login">Login</label>
                <input
                  id="new-login"
                  type="text"
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-password">Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-display-name">Display name</label>
                <input
                  id="new-display-name"
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-role">Role</label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as 'EDITOR' | 'VIEWER')
                  }
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </form>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="placeholder-content">Loading users...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Login</th>
                <th>Display name</th>
                <th>Role</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.login}</td>
                  <td>{u.displayName ?? '-'}</td>
                  <td>{roleBadge(u.role)}</td>
                  <td>{u.active ? 'Yes' : 'No'}</td>
                  <td>
                    {u.active && u.role !== 'ADMIN' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeactivate(u.id)}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
