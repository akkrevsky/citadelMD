import { useEffect, useState } from 'react'
import { api } from '../api-client.js'

export interface Revision {
  sha: string
  message: string
  authorName: string
  date: string
}

interface RevisionTreeProps {
  documentId: string
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

export function RevisionTree({ documentId, onRestore }: RevisionTreeProps) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Map<string, DiffStats>>(new Map())
  const [diffLoading, setDiffLoading] = useState<string | null>(null)
  const [restoringSha, setRestoringSha] = useState<string | null>(null)

  useEffect(() => {
    loadRevisions()
  }, [documentId])

  async function loadRevisions() {
    try {
      const res = await api.getRevisions(documentId)
      setRevisions(res.revisions ?? [])
    } catch {
      setRevisions([])
    }
  }

  async function toggleDiff(sha: string) {
    if (expandedSha === sha) {
      setExpandedSha(null)
      return
    }

    setExpandedSha(sha)

    if (diffs.has(sha)) return

    setDiffLoading(sha)
    try {
      const diff = await api.getRevisionDiff(documentId, sha)
      const stats = countDiffLines(diff)
      setDiffs((prev) => {
        const next = new Map(prev)
        next.set(sha, { ...stats, diff })
        return next
      })
    } catch {
      // ignore
    } finally {
      setDiffLoading(null)
    }
  }

  async function handleRestore(sha: string) {
    setRestoringSha(sha)
    try {
      await api.restoreToRevision(documentId, sha)
      await loadRevisions()
      onRestore(sha)
    } catch (err) {
      console.error('Restore failed:', err)
    } finally {
      setRestoringSha(null)
    }
  }

  if (revisions.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No revisions yet</p>
  }

  return (
    <div className="revision-tree">
      {revisions.map((rev) => {
        const isExpanded = expandedSha === rev.sha
        const diff = diffs.get(rev.sha)

        return (
          <div key={rev.sha} className={`revision-entry${isExpanded ? ' expanded' : ''}`}>
            <div
              className="revision-header"
              onClick={() => toggleDiff(rev.sha)}
              style={{ cursor: 'pointer' }}
            >
              <span className="revision-chevron">{isExpanded ? '▼' : '▶'}</span>
              <span className="revision-sha">{rev.sha.substring(0, 7)}</span>
              <span className="revision-message">{rev.message}</span>
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
                    {restoringSha === rev.sha ? 'Restoring…' : 'Restore to this version'}
                  </button>
                </div>
                {diff?.diff && (
                  <pre className="revision-diff">
                    {diff.diff.split('\n').map((line, i) => (
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
