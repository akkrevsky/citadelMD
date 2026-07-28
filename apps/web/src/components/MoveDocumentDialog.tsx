import { useState } from 'react'
import type { TreeItem } from '../api-client'

interface MoveDocumentDialogProps {
  documentTitle: string
  tree: TreeItem[]
  onMove: (folderId: string) => void
  onClose: () => void
}

function collectFolders(items: TreeItem[], depth = 0): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = []
  for (const item of items) {
    if (item.type === 'folder') {
      result.push({ id: item.id, label: `${'  '.repeat(depth)}${item.name}` })
      if (item.children) {
        result.push(...collectFolders(item.children, depth + 1))
      }
    }
  }
  return result
}

export function MoveDocumentDialog({
  documentTitle,
  tree,
  onMove,
  onClose,
}: MoveDocumentDialogProps) {
  const folders = collectFolders(tree)
  const [folderId, setFolderId] = useState(folders[0]?.id ?? '')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog move-document-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Move document</h3>
        <p className="move-document-title">{documentTitle}</p>
        <label className="move-document-label">
          Target folder
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!folderId}
            onClick={() => onMove(folderId)}
          >
            Move
          </button>
        </div>
      </div>
    </div>
  )
}
