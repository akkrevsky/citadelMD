import { useEffect } from 'react'

export interface ToastData {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastContainerProps {
  toasts: ToastData[]
  onRemove: (id: number) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onRemove(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

let nextId = 1

export function createToast(
  setToasts: React.Dispatch<React.SetStateAction<ToastData[]>>,
  message: string,
  type: 'success' | 'error' | 'info' = 'info',
) {
  const id = nextId++
  setToasts((prev) => [...prev, { id, message, type }])
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, 3500)
}
