import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown-renderer.js'

describe('renderMarkdown — syntax highlighting', () => {
  it('highlights javascript fenced blocks with prism tokens', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```')
    expect(html).toContain('class="language-js"')
    expect(html).toContain('token keyword')
    expect(html).toContain('token number')
    expect(html).toContain('>const</span>')
  })

  it('highlights python fenced blocks', () => {
    const html = renderMarkdown('```python\ndef f(x):\n  return x\n```')
    expect(html).toContain('token keyword')
    expect(html).toContain('>def</span>')
    expect(html).toContain('token function')
  })

  it('highlights bash fenced blocks', () => {
    const html = renderMarkdown('```bash\necho hello && ls -la\n```')
    expect(html).toContain('token builtin')
    expect(html).toContain('>echo</span>')
  })

  it('highlights json fenced blocks', () => {
    const html = renderMarkdown('```json\n{ "key": 1 }\n```')
    // Prism marks object keys as `property` and values as `number`
    expect(html).toContain('token property')
    expect(html).toContain('token number')
  })

  it('highlights markdown fenced blocks', () => {
    const html = renderMarkdown('```markdown\n# Title\n**bold**\n```')
    expect(html).toContain('token title')
  })

  it('falls back to plain code for unknown languages', () => {
    const html = renderMarkdown('```foobar\nplain text <>&\n```')
    expect(html).toContain('class="language-foobar"')
    expect(html).not.toContain('token')
    // content stays escaped
    expect(html).toContain('plain text &lt;&gt;&amp;')
  })

  it('keeps code blocks without a language plain', () => {
    const html = renderMarkdown('```\njust text\n```')
    expect(html).toContain('>just text')
    expect(html).not.toContain('token')
  })

  it('escapes script tags inside code blocks', () => {
    const html = renderMarkdown('```js\n<script>alert(1)</script>\n```')
    // angle brackets are escaped and split into operator tokens — no
    // executable markup may survive
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;')
  })

  it('does not affect inline code', () => {
    const html = renderMarkdown('inline `const x = 1` here')
    expect(html).toContain('<code>const x = 1</code>')
    expect(html).not.toContain('token')
  })
})

describe('renderMarkdown — regression', () => {
  it('still renders latex math', () => {
    const html = renderMarkdown('Math: $E=mc^2$')
    expect(html).toContain('katex')
    expect(html).toContain('E=mc^2')
  })

  it('still renders excalidraw embeds', () => {
    const html = renderMarkdown('```excalidraw\nnot-a-diagram\n```')
    expect(html).toContain('excalidraw-embed-invalid')
  })

  it('still strips raw html', () => {
    const html = renderMarkdown('<b onclick="x()">bold</b>')
    expect(html).not.toContain('<b')
  })

  it('renders mermaid fences as .mermaid divs through the full pipeline', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```')
    expect(html).toContain('<div class="mermaid">graph TD\nA--&gt;B\n</div>')
    expect(html).not.toContain('<svg')
  })
})

describe('renderMarkdown — task lists', () => {
  it('renders unchecked and checked task items as checkboxes', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done')
    expect(html).toContain('task-list-item')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('disabled')
    expect(html).toContain('checked=""')
    expect(html).toContain('todo')
    expect(html).toContain('done')
  })

  it('wraps task text in a label', () => {
    const html = renderMarkdown('- [x] finished')
    expect(html).toContain('task-list-item-label')
    expect(html).toContain('finished')
  })

  it('leaves regular bullet lists untouched', () => {
    const html = renderMarkdown('- plain item')
    expect(html).not.toContain('task-list-item')
    expect(html).toContain('<li>plain item</li>')
  })

  it('strips event handlers from checkbox markup', () => {
    const html = renderMarkdown('- [ ] <b onclick="x()">safe</b>')
    expect(html).not.toContain('onclick')
  })
})

describe('renderMarkdown — document links', () => {
  it('keeps the doc-link class through sanitization', () => {
    const html = renderMarkdown('[Note](folder/note.md)')
    expect(html).toContain('class="doc-link"')
    expect(html).toContain('href="folder/note.md"')
  })

  it('strips javascript: hrefs', () => {
    const html = renderMarkdown('[X](javascript:alert(1))')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('doc-link')
  })
})
