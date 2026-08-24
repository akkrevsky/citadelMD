/** Derive a document title from an imported file name (extension stripped). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.(md|txt)$/i, '')
  const trimmed = base.trim().slice(0, 200)
  return trimmed || 'untitled'
}

/** Whether a dropped file can be imported as a new document. */
export function isImportableFile(file: File): boolean {
  return (
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    /\.(md|txt)$/i.test(file.name)
  )
}
