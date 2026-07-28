import { useEffect, useRef } from 'react'

interface TabContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onMove: () => void
  onCloseOthers: () => void
  onCloseLeft: () => void
  onCloseRight: () => void
}

export function TabContextMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete,
  onMove,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
}: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div ref={ref} className="tab-context-menu" style={{ top: y, left: x }}>
      <button type="button" onClick={() => run(onRename)}>Rename</button>
      <button type="button" onClick={() => run(onMove)}>Move to folder</button>
      <button type="button" className="tab-context-menu-danger" onClick={() => run(onDelete)}>
        Delete
      </button>
      <div className="tab-context-menu-separator" />
      <button type="button" onClick={() => run(onCloseOthers)}>Close others</button>
      <button type="button" onClick={() => run(onCloseLeft)}>Close to the left</button>
      <button type="button" onClick={() => run(onCloseRight)}>Close to the right</button>
    </div>
  )
}
