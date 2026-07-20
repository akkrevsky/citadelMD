import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type CurrentUser } from '../api-client'

export default function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [navigate])

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    setSaving(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  if (!user) return null

  return (
    <div>
      <div className="main-header">
        <h1>Profile</h1>
      </div>
      <div className="main-content profile-page">
        <div className="card">
          <h3>Account info</h3>
          <div className="info-row">
            <span className="label">Login</span>
            <span>{user.login}</span>
          </div>
          <div className="info-row">
            <span className="label">Display name</span>
            <span>{user.displayName ?? '-'}</span>
          </div>
          <div className="info-row">
            <span className="label">Role</span>
            <span>{user.role.toLowerCase()}</span>
          </div>
          <div className="info-row">
            <span className="label">User ID</span>
            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
              {user.id}
            </span>
          </div>
        </div>

        <div className="card password-form">
          <h3>Change password</h3>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
