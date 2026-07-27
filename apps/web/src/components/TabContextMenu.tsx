import { useEffect, useRef } from 'react'

interface TabContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCloseOthers: () => void
  onCloseLeft: () => void
  onCloseRight: () => void
}

export function TabContextMenu({
  x,
  y,
  onClose,
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

  return (
    <div ref={ref} className="tab-context-menu" style={{ top: y, left: x }}>
      <button type="button" onClick={() => { onCloseOthers(); onClose() }}>Close others</button>
      <button type="button" onClick={() => { onCloseLeft(); onClose() }}>Close to the left</button>
      <button type="button" onClick={() => { onCloseRight(); onClose() }}>Close to the right</button>
    </div>
  )
}
