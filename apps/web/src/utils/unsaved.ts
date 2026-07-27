/**
 * Lightweight pub-sub for uncommitted-changed state per document.
 * Used by DocumentEditPage (setter) and sidebar tree (getter).
 */
const unsavedChanges = new Set<string>()
const listeners = new Set<(docId: string) => void>()

export function setUnsavedChanges(docId: string) {
  unsavedChanges.add(docId)
  listeners.forEach((fn) => fn(docId))
}

export function clearUnsavedChanges(docId: string) {
  unsavedChanges.delete(docId)
  listeners.forEach((fn) => fn(docId))
}

export function hasUnsavedChanges(docId: string): boolean {
  return unsavedChanges.has(docId)
}

export function onUnsavedChangesChange(listener: (docId: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
