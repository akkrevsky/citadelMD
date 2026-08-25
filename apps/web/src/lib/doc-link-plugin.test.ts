import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { docLinkPlugin, isDocPath } from './doc-link-plugin.js'

function render(md: string): string {
  const parser = new MarkdownIt()
  parser.use(docLinkPlugin)
  return parser.render(md)
}

describe('isDocPath', () => {
  it('accepts relative file paths', () => {
    expect(isDocPath('folder/note.md')).toBe(true)
    expect(isDocPath('note.md')).toBe(true)
    expect(isDocPath('folder/my file.md')).toBe(true)
  })

  it('rejects schemes, anchors and absolute paths', () => {
    expect(isDocPath('https://example.com')).toBe(false)
    expect(isDocPath('mailto:x@y.z')).toBe(false)
    expect(isDocPath('#anchor')).toBe(false)
    expect(isDocPath('/api/uploads/1')).toBe(false)
    expect(isDocPath('javascript:alert(1)')).toBe(false)
    expect(isDocPath('')).toBe(false)
  })
})

describe('docLinkPlugin', () => {
  it('marks document links with the doc-link class', () => {
    const html = render('[Note](folder/note.md)')
    expect(html).toContain('class="doc-link"')
    expect(html).toContain('href="folder/note.md"')
    expect(html).toContain('>Note</a>')
  })

  it('supports angle-bracket destinations with spaces', () => {
    // markdown-it percent-encodes the space; MarkdownPreview decodes on click
    const html = render('[Note](<folder/my file.md>)')
    expect(html).toContain('class="doc-link"')
    expect(html).toContain('href="folder/my%20file.md"')
  })

  it('preserves link titles', () => {
    const html = render('[Note](folder/note.md "T")')
    expect(html).toContain('title="T"')
    expect(html).toContain('class="doc-link"')
  })

  it('leaves external, absolute and anchor links untouched', () => {
    const html = render('[X](https://example.com) [Y](/abs) [Z](#anchor)')
    expect(html).not.toContain('doc-link')
  })
})
