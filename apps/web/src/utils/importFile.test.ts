import { describe, it, expect } from 'vitest'
import { titleFromFileName, isImportableFile } from './importFile'

describe('titleFromFileName', () => {
  it('strips the markdown and text extensions', () => {
    expect(titleFromFileName('notes.md')).toBe('notes')
    expect(titleFromFileName('My Doc.TXT')).toBe('My Doc')
    expect(titleFromFileName('a.md.b.md')).toBe('a.md.b')
  })

  it('falls back to untitled for empty names', () => {
    expect(titleFromFileName('.md')).toBe('untitled')
    expect(titleFromFileName('   ')).toBe('untitled')
  })

  it('truncates long names to 200 chars', () => {
    expect(titleFromFileName('x'.repeat(250) + '.md').length).toBe(200)
  })
})

describe('isImportableFile', () => {
  it('accepts markdown and plain text mime types', () => {
    expect(isImportableFile({ type: 'text/markdown', name: 'a.md' } as File)).toBe(true)
    expect(isImportableFile({ type: 'text/plain', name: 'a.txt' } as File)).toBe(true)
  })

  it('accepts octet-stream with md/txt extension', () => {
    expect(isImportableFile({ type: 'application/octet-stream', name: 'a.md' } as File)).toBe(true)
  })

  it('rejects images and pdfs', () => {
    expect(isImportableFile({ type: 'image/png', name: 'a.png' } as File)).toBe(false)
    expect(isImportableFile({ type: 'application/pdf', name: 'a.pdf' } as File)).toBe(false)
  })
})
