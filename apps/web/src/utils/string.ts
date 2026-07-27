/** Truncate s to maxLen, appending '…' if truncated */
export function truncate(s: string, maxLen = 25): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

/** Format updatedAt as "M.DD HH-MM-SS" in local time */
export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = d.getMonth() + 1
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${mm}.${dd} ${hh}-${min}-${ss}`
}
