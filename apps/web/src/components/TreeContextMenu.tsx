import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface TreeMenuItem {
  label?: string
  danger?: boolean
  separator?: boolean
  onSelect?: () => void
}

interface TreeContextMenuProps {
  x: number
  y: number
  items: TreeMenuItem[]
  onClose: () => void
}

export function TreeContextMenu({ x, y, items, onClose }: TreeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Keep the menu inside the viewport (jsdom measures 0x0, so clamp with 0 floor)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const width = el.offsetWidth || 0
    const height = el.offsetHeight || 0
    setPos({
      x: Math.max(0, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(0, Math.min(y, window.innerHeight - height - 8)),
    })
  }, [x, y])

  function run(item: TreeMenuItem) {
    item.onSelect?.()
    onClose()
  }

  return (
    <div ref={ref} className="tab-context-menu" style={{ top: pos.y, left: pos.x }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="tab-context-menu-separator" />
        ) : (
          <button
            key={i}
            type="button"
            className={item.danger ? 'tab-context-menu-danger' : undefined}
            onClick={() => run(item)}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
