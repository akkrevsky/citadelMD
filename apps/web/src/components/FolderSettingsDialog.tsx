import { useState } from 'react'
import { api } from '../api-client'

interface FolderSettingsDialogProps {
  folderId: string
  folderName: string
  currentMode: 'GIT' | 'SNAPSHOT'
  onClose: () => void
  onSaved: (mode: 'GIT' | 'SNAPSHOT') => void
}

export function FolderSettingsDialog({
  folderId,
  folderName,
  currentMode,
  onClose,
  onSaved,
}: FolderSettingsDialogProps) {
  const [mode, setMode] = useState<'GIT' | 'SNAPSHOT'>(currentMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.updateFolderSettings(folderId, { mode })
      onSaved(mode)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content folder-settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>Folder settings: {folderName}</h3>
        </div>
        <div style={{ padding: '16px' }}>
          <p className="settings-hint">
            Choose how documents in this folder are versioned.
          </p>
          <label className="settings-radio">
            <input
              type="radio"
              name="folder-mode"
              checked={mode === 'GIT'}
              onChange={() => setMode('GIT')}
            />
            Git versioning (manual commits, history, rollback)
          </label>
          <label className="settings-radio" style={{ display: 'block', marginTop: '0.75rem' }}>
            <input
              type="radio"
              name="folder-mode"
              checked={mode === 'SNAPSHOT'}
              onChange={() => setMode('SNAPSHOT')}
            />
            Snapshot only (keep latest version, no git commits)
          </label>
          {error && <p className="upload-error-text" style={{ marginTop: '0.75rem' }}>{error}</p>}
          <div className="confirm-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
