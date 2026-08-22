import { describe, it, expect } from 'vitest'
import { formatCreatedAt, buildFormatCommand } from './format'

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

describe('buildFormatCommand', () => {
  it('builds the code-insertion wrap command', () => {
    expect(buildFormatCommand('code')).toEqual({
      action: 'wrap',
      wrapper: '`',
      placeholder: 'code',
    })
  })

  it('builds bold and link wrap commands', () => {
    expect(buildFormatCommand('bold')).toEqual({
      action: 'wrap',
      wrapper: '**',
      placeholder: 'bold text',
    })
    expect(buildFormatCommand('link')).toEqual({
      action: 'wrap',
      wrapper: { left: '[', right: '](https://)' },
      placeholder: 'link text',
    })
  })

  it('builds prefix commands for headings and task lists', () => {
    expect(buildFormatCommand('h2')).toEqual({ action: 'prefix', prefix: '## ', placeholder: 'Heading 2' })
    expect(buildFormatCommand('task')).toEqual({ action: 'prefix', prefix: '- [ ] ', placeholder: 'task' })
  })

  it('builds insert commands for tables and horizontal rules', () => {
    const table = buildFormatCommand('table')
    expect(table.action).toBe('insert')
    expect(table.placeholder).toContain('| Header 1 | Header 2 |')
    const hr = buildFormatCommand('hr')
    expect(hr.action).toBe('insert')
    expect(hr.placeholder).toContain('---')
  })

  it('builds direct action commands', () => {
    expect(buildFormatCommand('undo')).toEqual({ action: 'undo' })
    expect(buildFormatCommand('redo')).toEqual({ action: 'redo' })
    expect(buildFormatCommand('find')).toEqual({ action: 'find' })
  })

  it('returns an empty payload for unknown types', () => {
    expect(buildFormatCommand('nonsense')).toEqual({})
  })
})
