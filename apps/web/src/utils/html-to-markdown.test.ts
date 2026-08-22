import { describe, it, expect } from 'vitest'
import { parseHtmlClipboard } from './html-to-markdown'

describe('parseHtmlClipboard — formatting', () => {
  it('converts bold, italic, strike and code', () => {
    const { text } = parseHtmlClipboard(
      '<p><b>bold</b> <i>italic</i> <s>strike</s> <code>code()</code></p>',
    )
    expect(text).toContain('**bold**')
    expect(text).toContain('*italic*')
    expect(text).toContain('~~strike~~')
    expect(text).toContain('`code()`')
  })

  it('converts headings and paragraphs', () => {
    const { text } = parseHtmlClipboard('<h1>Title</h1><p>Hello <b>world</b></p>')
    expect(text).toContain('# Title')
    expect(text).toContain('Hello **world**')
  })

  it('converts links with hrefs', () => {
    const { text } = parseHtmlClipboard('<a href="https://example.com">site</a>')
    expect(text).toContain('[site](https://example.com)')
  })

  it('converts unordered and ordered lists', () => {
    const { text } = parseHtmlClipboard('<ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol>')
    expect(text).toContain('- one')
    expect(text).toContain('- two')
    expect(text).toContain('1. first')
    expect(text).toContain('2. second')
  })

  it('converts blockquotes and code fences', () => {
    const { text } = parseHtmlClipboard(
      '<blockquote>quoted</blockquote><pre><code>const x = 1</code></pre>',
    )
    expect(text).toContain('> quoted')
    expect(text).toContain('```')
    expect(text).toContain('const x = 1')
  })

  it('converts tables to markdown tables', () => {
    const { text } = parseHtmlClipboard(
      '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>',
    )
    expect(text).toContain('| a | b |')
    expect(text).toContain('| 1 | 2 |')
  })

  it('keeps plain text passthrough', () => {
    const { text } = parseHtmlClipboard('<div>just text &amp; symbols</div>')
    expect(text).toContain('just text & symbols')
  })
})

describe('parseHtmlClipboard — images', () => {
  it('keeps external image urls inline', () => {
    const { text, images } = parseHtmlClipboard(
      '<p>see <img src="https://example.com/pic.png" alt="pic"></p>',
    )
    expect(text).toContain('![pic](https://example.com/pic.png)')
    expect(images).toHaveLength(0)
  })

  it('extracts data-uri images into the images list with placeholders', () => {
    const { text, images } = parseHtmlClipboard(
      '<p>a <img src="data:image/png;base64,AAAA" alt="one"> b <img src="data:image/png;base64,BBBB" alt="two"></p>',
    )
    expect(images).toHaveLength(2)
    expect(images[0]).toMatchObject({ dataUrl: 'data:image/png;base64,AAAA', alt: 'one' })
    expect(images[1]).toMatchObject({ dataUrl: 'data:image/png;base64,BBBB', alt: 'two' })
    expect(text).toContain('__IMG_0__')
    expect(text).toContain('__IMG_1__')
  })

  it('ignores script and style content', () => {
    const { text, images } = parseHtmlClipboard(
      '<script>alert(1)</script><style>.x{}</style><p>clean</p>',
    )
    expect(text).not.toContain('alert')
    expect(text).toContain('clean')
    expect(images).toHaveLength(0)
  })
})
