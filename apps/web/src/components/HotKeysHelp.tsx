import { useEffect, type CSSProperties } from 'react'

interface HotKeysHelpProps { open: boolean; onClose: () => void }

const HOTKEYS = [
  { key: 'Ctrl+S', desc: 'Save (Auto-save commit)' },
  { key: 'Ctrl+W', desc: 'Close current tab' },
  { key: 'Ctrl+E', desc: 'Cycle: code / split / preview' },
  { key: 'Ctrl+H', desc: 'Find & Replace' },
  { key: 'Ctrl+?', desc: 'Show this help' },
  { key: 'Single-click doc', desc: 'Open preview (replaces tab)' },
  { key: 'Double-click doc', desc: 'Open in new pinned tab' },
  { key: 'Right-click tab', desc: 'Close others / left / right' },
]

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
}
const modalStyle: CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: '8px', padding: '1.5rem', maxWidth: '480px', width: '90%',
}
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }
const tdStyle: CSSProperties = { padding: '.35rem .5rem', fontSize: '.85rem' }

export default function HotKeysHelp({ open, onClose }: HotKeysHelpProps) {
  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.75rem' }}>⌨️ Keyboard Shortcuts</h3>
        <table style={tableStyle}>
          <thead>
            <tr>{['Shortcut', 'Action'].map((h) => <th key={h} style={{ ...tdStyle, fontWeight: 700, borderBottom: '2px solid var(--color-border)' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {HOTKEYS.map((hk) => (
              <tr key={hk.key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '.78rem', whiteSpace: 'nowrap' }}><kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '3px', fontSize: '.75rem' }}>{hk.key}</kbd></td>
                <td style={tdStyle}>{hk.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
