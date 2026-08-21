import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { excalidrawBlockPlugin } from './excalidraw-plugin.js'

function render(md: string): string {
  const parser = new MarkdownIt()
  parser.use(excalidrawBlockPlugin)
  return parser.render(md)
}

describe('excalidrawBlockPlugin', () => {
  it('renders SVG from base64 data URL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`
    const html = render(`\`\`\`excalidraw\n${dataUrl}\n\`\`\``)
    expect(html).toContain('class="excalidraw-embed"')
    expect(html).toContain('<svg')
    expect(html).toContain('<rect')
  })

  it('renders raw SVG content', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
    const html = render(`\`\`\`excalidraw\n${svg}\n\`\`\``)
    expect(html).toContain('<circle')
  })

  it('shows placeholder for empty block', () => {
    const html = render('```excalidraw\n\n```')
    expect(html).toContain('excalidraw-embed-empty')
  })

  it('shows error for invalid content', () => {
    const html = render('```excalidraw\nnot-a-diagram\n```')
    expect(html).toContain('excalidraw-embed-invalid')
  })

  it('does not affect other fenced code blocks', () => {
    const html = render('```js\nconst x = 1\n```')
    expect(html).toContain('<code')
    expect(html).not.toContain('excalidraw-embed')
  })
})
