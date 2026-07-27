import { describe, it, expect } from 'vitest'
import { formatCreatedAt } from './format'

describe('formatCreatedAt', () => {
  it('formats an ISO string as MM.DD HH-MM', () => {
    // 2026-07-23T17:30:00 in UTC. We compare against the formatter's own
    // interpretation, so this is a round-trip structural check.
    const out = formatCreatedAt('2026-07-23T17:30:00Z')
    expect(out).toMatch(/^\d{2}\.\d{2} \d{2}-\d{2}$/)
  })

  it('produces the expected local-time pattern', () => {
    // Use a fixed local-time-ish check: build a date, format it, and confirm
    // the components match a manual Date read in the same timezone.
    const iso = '2026-12-31T23:59:00'
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    expect(formatCreatedAt(iso)).toBe(`${mm}.${dd} ${hh}-${min}`)
  })

  it('returns empty string for invalid input', () => {
    expect(formatCreatedAt('')).toBe('')
    expect(formatCreatedAt('not-a-date')).toBe('')
  })

  it('zero-pads single-digit components', () => {
    // Jan 1, 01:05
    const out = formatCreatedAt('2026-01-01T01:05:00')
    const d = new Date('2026-01-01T01:05:00')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    expect(out).toBe(`${mm}.${dd} ${hh}-${min}`)
  })
})
