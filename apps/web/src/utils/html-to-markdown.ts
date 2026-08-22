/**
 * Converts rich HTML from the clipboard into markdown. Images embedded as
 * data: URIs are replaced with __IMG_<n>__ placeholders and returned in
 * the images list, so the caller can upload them and substitute real URLs.
 */

export interface ParsedHtmlClipboard {
  text: string
  images: Array<{ dataUrl: string; alt: string }>
}

const IMG_PLACEHOLDER = '__IMG_'

export function parseHtmlClipboard(html: string): ParsedHtmlClipboard {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images: ParsedHtmlClipboard['images'] = []
  const text = convertBlock(doc.body)

  return { text: collapseWhitespace(text), images }

  function convertBlock(node: Node): string {
    let out = ''
    for (const child of Array.from(node.childNodes)) {
      out += convertNode(child)
    }
    return out
  }

  function convertNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').replace(/\s+/g, ' ')
    }

    const el = node as HTMLElement
    if (el.nodeType !== Node.ELEMENT_NODE) return ''

    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'head') return ''

    switch (tag) {
      case 'b':
      case 'strong':
        return `**${convertBlock(el)}**`
      case 'i':
      case 'em':
        return `*${convertBlock(el)}*`
      case 's':
      case 'strike':
      case 'del':
        return `~~${convertBlock(el)}~~`
      case 'code':
        return `\`${convertBlock(el).trim()}\``
      case 'a': {
        const href = el.getAttribute('href') ?? ''
        return `[${convertBlock(el)}](${href})`
      }
      case 'img':
        return convertImage(el)
      case 'br':
        return '\n'
      case 'h1':
        return `# ${convertBlock(el)}\n\n`
      case 'h2':
        return `## ${convertBlock(el)}\n\n`
      case 'h3':
        return `### ${convertBlock(el)}\n\n`
      case 'h4':
        return `#### ${convertBlock(el)}\n\n`
      case 'h5':
        return `##### ${convertBlock(el)}\n\n`
      case 'h6':
        return `###### ${convertBlock(el)}\n\n`
      case 'p':
      case 'div':
        return `${convertBlock(el)}\n\n`
      case 'ul': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(
          (li) => `- ${convertBlock(li).trim()}`,
        )
        return `${items.join('\n')}\n\n`
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(
          (li, i) => `${i + 1}. ${convertBlock(li).trim()}`,
        )
        return `${items.join('\n')}\n\n`
      }
      case 'li':
        return convertBlock(el)
      case 'blockquote':
        return `> ${convertBlock(el).trim()}\n\n`
      case 'pre': {
        const code = el.textContent ?? ''
        return `\`\`\`\n${code.trim()}\n\`\`\`\n\n`
      }
      case 'table':
        return convertTable(el)
      case 'hr':
        return '\n---\n\n'
      default:
        return convertBlock(el)
    }
  }

  function convertImage(el: HTMLElement): string {
    const src = el.getAttribute('src') ?? ''
    const alt = el.getAttribute('alt') ?? ''
    if (src.startsWith('data:')) {
      images.push({ dataUrl: src, alt })
      return `${IMG_PLACEHOLDER}${images.length - 1}__ `
    }
    return `![${alt}](${src}) `
  }

  function convertTable(el: HTMLElement): string {
    const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children)
        .map((cell) => convertBlock(cell).trim())
        .join(' | '),
    )
    if (rows.length === 0) return ''
    const header = rows[0]
    const separator = `| ${header
      .split('|')
      .map(() => '---')
      .join(' | ')} |`
    const body = rows.slice(1).map((r) => `| ${r} |`)
    return `| ${header} |\n${separator}\n${body.join('\n')}\n\n`
  }
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Convert a data: URI to a File for upload. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}
