/** Physical-key check — works regardless of keyboard layout (e.g. Russian Ctrl+С). */
export function isModShortcut(e: KeyboardEvent, code: string): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.code === code
}
