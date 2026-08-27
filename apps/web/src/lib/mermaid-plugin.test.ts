import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { mermaidBlockPlugin } from './mermaid-plugin.js'

function render(src: string): string {
  const md = new MarkdownIt()
  md.use(mermaidBlockPlugin)
  return md.render(src)
}

describe('mermaidBlockPlugin', () => {
  it('renders a mermaid fence as an escaped .mermaid div', () => {
    const html = render('```mermaid\ngraph TD\n A-->B\n```')
    expect(html).toContain('<div class="mermaid">graph TD\n A--&gt;B\n</div>')
  })

  it('escapes special characters in diagram source', () => {
    const html = render('```mermaid\ngraph TD\n A["<b>&x"]-->B\n```')
    expect(html).toContain('A[&quot;&lt;b&gt;&amp;x&quot;]')
    expect(html).not.toContain('A["<b>&x"]')
  })

  it('renders an empty mermaid fence as an empty .mermaid div', () => {
    const html = render('```mermaid\n```')
    expect(html).toContain('<div class="mermaid"></div>')
  })

  it('delegates non-mermaid fences to the default renderer', () => {
    const html = render('```js\nconst x = 1\n```')
    expect(html).toContain('<pre><code class="language-js">const x = 1\n</code></pre>')
  })
})
