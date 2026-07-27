/**
 * Pub-sub for per-document editor state used by tabs and sidebar tree.
 */
const unsaved = new Set<string>()
const uncommitted = new Set<string>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function setUnsavedChanges(docId: string) {
  if (!unsaved.has(docId)) {
    unsaved.add(docId)
    notify()
  }
}

export function clearUnsavedChanges(docId: string) {
  if (unsaved.delete(docId)) notify()
}

export function hasUnsavedChanges(docId: string): boolean {
  return unsaved.has(docId)
}

export function setUncommittedChanges(docId: string) {
  if (!uncommitted.has(docId)) {
    uncommitted.add(docId)
    notify()
  }
}

export function clearUncommittedChanges(docId: string) {
  if (uncommitted.delete(docId)) notify()
}

export function hasUncommittedChanges(docId: string): boolean {
  return uncommitted.has(docId)
}

export function onDocumentStateChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
