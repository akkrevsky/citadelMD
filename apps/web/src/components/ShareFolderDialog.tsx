import { useEffect, useState } from 'react'
import {
  api,
  type FolderPermissionEntry,
  type UserRecord,
} from '../api-client.js'

interface ShareFolderDialogProps {
  folderId: string
  folderName: string
  /** Folder owner's user id (excluded from the grantable list; undefined is fine) */
  ownerId?: string | null
  onClose: () => void
  onSaved: () => void
}

interface GrantRow {
  key: number
  userId: string
  permission: 'VIEW' | 'EDIT' | 'ADMIN'
}

let nextKey = 1

export function ShareFolderDialog({
  folderId,
  folderName,
  ownerId,
  onClose,
  onSaved,
}: ShareFolderDialogProps) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [rows, setRows] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getFolderPermissions(folderId), api.listUsers()])
      .then(([permissions, allUsers]) => {
        if (cancelled) return
        const grantable = allUsers.filter((u) => u.id !== ownerId)
        setUsers(grantable)
        setRows(
          (permissions as FolderPermissionEntry[])
            .filter((p) => p.userId !== ownerId)
            .map((p) => ({ key: nextKey++, userId: p.userId, permission: p.permission })),
        )
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [folderId, ownerId])

  function updateRow(key: number, patch: Partial<GrantRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.setFolderPermissions(folderId, rows.map((r) => ({
        userId: r.userId,
        permission: r.permission,
      })))
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content share-folder-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Share folder</h3>
        <p className="move-document-title">{folderName}</p>

        {loading ? (
          <p className="share-folder-hint">Loading…</p>
        ) : (
          <>
            {error && <p className="share-folder-error">{error}</p>}
            <div className="share-folder-rows">
              {rows.map((row) => (
                <div key={row.key} className="share-folder-row">
                  <select
                    value={row.userId}
                    onChange={(e) => updateRow(row.key, { userId: e.target.value })}
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.login}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.permission}
                    onChange={(e) =>
                      updateRow(row.key, {
                        permission: e.target.value as GrantRow['permission'],
                      })
                    }
                  >
                    <option value="VIEW">View</option>
                    <option value="EDIT">Edit</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="share-folder-hint">No shared access yet — add a user below.</p>
              )}
            </div>

            <button
              type="button"
              className="btn btn-sm"
              disabled={users.length === 0}
              onClick={() => {
                if (users.length === 0) return
                setRows((prev) => [
                  ...prev,
                  { key: nextKey++, userId: users[0].id, permission: 'VIEW' },
                ])
              }}
            >
              + Add user
            </button>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={loading || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
