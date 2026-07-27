import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type CurrentUser } from '../api-client'
import { useTheme } from '../hooks/useTheme'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  // Git identity form
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user)
        setGitName(res.user.gitName ?? '')
        setGitEmail(res.user.gitEmail ?? '')
      })
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

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileSaving(true)
    try {
      const res = await api.updateProfile({
        gitName: gitName.trim() || null,
        gitEmail: gitEmail.trim() || null,
      })
      setUser(res.user)
      setProfileSuccess('Settings saved')
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setProfileSaving(false)
    }
  }

  if (loading) return null

  if (!user) return null

  return (
    <div>
      <div className="main-header">
        <h1>Profile &amp; Settings</h1>
      </div>
      <div className="main-content profile-page">
        {/* Account info */}
        <div className="card">
          <h3>Account</h3>
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
            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{user.id}</span>
          </div>
        </div>

        {/* Appearance */}
        <div className="card">
          <h3>Appearance</h3>
          <div className="settings-theme-row">
            <label className="settings-radio">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={theme === 'light'}
                onChange={() => setTheme('light')}
              />
              <span>Light</span>
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={theme === 'dark'}
                onChange={() => setTheme('dark')}
              />
              <span>Dark</span>
            </label>
          </div>
        </div>

        {/* Git identity */}
        <div className="card">
          <h3>Git identity</h3>
          <p className="settings-hint">
            Used as the author of every git commit you make (commits, discards, restores).
          </p>
          {profileError && <div className="error-message">{profileError}</div>}
          {profileSuccess && <div className="success-message">{profileSuccess}</div>}
          <form onSubmit={handleSaveProfile}>
            <div className="form-group">
              <label htmlFor="git-name">Git name</label>
              <input
                id="git-name"
                type="text"
                value={gitName}
                onChange={(e) => setGitName(e.target.value)}
                placeholder={user.login}
              />
            </div>
            <div className="form-group">
              <label htmlFor="git-email">Git email</label>
              <input
                id="git-email"
                type="email"
                value={gitEmail}
                onChange={(e) => setGitEmail(e.target.value)}
                placeholder={`${user.login}@mdcollab.local`}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>

        {/* Password */}
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
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
