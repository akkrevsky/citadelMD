/**
 * Format a creation timestamp as "MM.DD HH-MM" (e.g. "07.23 17-30").
 * Uses the user's local timezone. Returns '' for invalid input.
 */
export function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}.${dd} ${hh}-${min}`
}
