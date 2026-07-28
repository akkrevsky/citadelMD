import { useEffect, useState } from 'react'
import { api } from '../api-client.js'
import './RevisionTree.css'

export interface Revision {
  sha: string
  message: string
  authorName: string
  date: string
}

interface RevisionTreeProps {
  documentId: string
  refreshToken?: number
  onRestore: (sha: string) => void
}

interface DiffStats {
  added: number
  removed: number
  diff: string
}

function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return { added, removed }
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="revision-diff">
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'diff-line-added'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'diff-line-removed'
                : 'diff-line-context'
          }
        >
          {line || '\n'}
        </div>
      ))}
    </pre>
  )
}

export function RevisionTree({ documentId, refreshToken = 0, onRestore }: RevisionTreeProps) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Map<string, DiffStats>>(new Map())
  const [diffLoading, setDiffLoading] = useState<string | null>(null)
  const [restoringSha, setRestoringSha] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uncommittedDiff, setUncommittedDiff] = useState<string | null>(null)

  useEffect(() => {
    setExpandedKey(null)
    setDiffs(new Map())
    loadRevisions()
    loadUncommittedDiff()
  }, [documentId, refreshToken])

  async function loadRevisions() {
    setLoadError(null)
    try {
      const res = await api.getRevisions(documentId)
      setRevisions(res.revisions ?? [])
    } catch (err) {
      setRevisions([])
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить историю')
    }
  }

  async function loadUncommittedDiff() {
    try {
      const res = await api.getDiff(documentId)
      setUncommittedDiff(res.diff?.trim() ? res.diff : null)
    } catch {
      setUncommittedDiff(null)
    }
  }

  async function toggleDiff(key: string, sha?: string) {
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }

    setExpandedKey(key)

    if (key === 'uncommitted') {
      return
    }

    if (!sha || diffs.has(sha)) return

    setDiffLoading(sha)
    try {
      const diff = await api.getRevisionDiff(documentId, sha)
      const stats = countDiffLines(diff)
      setDiffs((prev) => {
        const next = new Map(prev)
        next.set(sha, { ...stats, diff })
        return next
      })
    } catch (err) {
      setDiffs((prev) => {
        const next = new Map(prev)
        next.set(sha, {
          added: 0,
          removed: 0,
          diff: err instanceof Error ? err.message : 'Не удалось загрузить diff',
        })
        return next
      })
    } finally {
      setDiffLoading(null)
    }
  }

  async function handleRestore(sha: string) {
    setRestoringSha(sha)
    try {
      await api.restoreToRevision(documentId, sha)
      await loadRevisions()
      await loadUncommittedDiff()
      onRestore(sha)
    } catch (err) {
      console.error('Restore failed:', err)
    } finally {
      setRestoringSha(null)
    }
  }

  if (loadError) {
    return <p className="revision-empty">{loadError}</p>
  }

  if (revisions.length === 0 && !uncommittedDiff) {
    return (
      <p className="revision-empty">
        Коммитов пока нет. Сохраните или закоммитьте документ, чтобы появилась история.
      </p>
    )
  }

  return (
    <div className="revision-tree">
      {uncommittedDiff && (
        <div className={`revision-entry uncommitted${expandedKey === 'uncommitted' ? ' expanded' : ''}`}>
          <div
            className="revision-header"
            onClick={() => toggleDiff('uncommitted')}
          >
            <span className="revision-chevron">{expandedKey === 'uncommitted' ? '▼' : '▶'}</span>
            <span className="revision-sha">WIP</span>
            <span className="revision-message">Незакоммиченные изменения</span>
            <span className="revision-diff-stats">
              {(() => {
                const s = countDiffLines(uncommittedDiff)
                return (
                  <>
                    {s.added > 0 && <span className="diff-added">+{s.added}</span>}
                    {s.removed > 0 && <span className="diff-removed">-{s.removed}</span>}
                  </>
                )
              })()}
            </span>
          </div>
          {expandedKey === 'uncommitted' && <DiffView diff={uncommittedDiff} />}
        </div>
      )}

      {revisions.map((rev) => {
        const isExpanded = expandedKey === rev.sha
        const diff = diffs.get(rev.sha)

        return (
          <div key={rev.sha} className={`revision-entry${isExpanded ? ' expanded' : ''}`}>
            <div
              className="revision-header"
              onClick={() => toggleDiff(rev.sha, rev.sha)}
            >
              <span className="revision-chevron">{isExpanded ? '▼' : '▶'}</span>
              <span className="revision-sha">{rev.sha.substring(0, 7)}</span>
              <span className="revision-message" title={rev.message}>{rev.message}</span>
              <span className="revision-author">{rev.authorName}</span>
              <span className="revision-date">{formatRevisionDate(rev.date)}</span>
              {diff && (
                <span className="revision-diff-stats">
                  {diff.added > 0 && <span className="diff-added">+{diff.added}</span>}
                  {diff.removed > 0 && <span className="diff-removed">-{diff.removed}</span>}
                </span>
              )}
              {diffLoading === rev.sha && <span className="loading">…</span>}
            </div>

            {isExpanded && (
              <div className="revision-body">
                <div className="revision-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleRestore(rev.sha)}
                    disabled={restoringSha === rev.sha}
                  >
                    {restoringSha === rev.sha ? 'Откат…' : 'Откатить к этой версии'}
                  </button>
                </div>
                {diff?.diff && <DiffView diff={diff.diff} />}
                {diffLoading === rev.sha && !diff && (
                  <p className="revision-empty">Загрузка diff…</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatRevisionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}.${dd} ${hh}:${min}`
}
