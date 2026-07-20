import MarkdownIt from 'markdown-it'
import prism from 'markdown-it-prism'
import mermaidPlugin from 'markdown-it-mermaid'
import taskLists from 'markdown-it-task-lists'
import container from 'markdown-it-container'
import DOMPurify from 'dompurify'
import type { Config as DOMPurifyConfig } from 'dompurify'

const PURIFY_CONFIG: DOMPurifyConfig = {
  ADD_ATTR: ['id'],
  ADD_TAGS: [
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'g', 'defs', 'use', 'image', 'text', 'tspan', 'marker',
    'stop', 'linearGradient', 'radialGradient', 'clipPath', 'mask',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'href', 'src', 'alt', 'width', 'height',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r',
    'x', 'y', 'dx', 'dy', 'rx', 'ry', 'points', 'transform',
    'xmlns', 'preserveAspectRatio',
  ],
  ALLOW_DATA_ATTR: false,
}

function embedPlugin(md: MarkdownIt): void {
  const originalRender = md.renderer.rules.text
  md.renderer.rules.text = (tokens: any[], idx: number) => {
    const text = tokens[idx].content
    const ytMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (ytMatch) return `<div class="embed-container"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe></div>`
    const vimeoMatch = text.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `<div class="embed-container"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" allowfullscreen></iframe></div>`
    return originalRender ? originalRender(tokens, idx, {} as any, {} as any, {} as any) : md.utils.escapeHtml(text)
  }
}

function createCalloutContainer(md: MarkdownIt, type: string): void {
  md.use(container, type, {
    render(tokens: any[], idx: number) {
      if (tokens[idx].nesting === 1) return `<div class="callout callout-${type}">\n`
      return '</div>\n'
    },
  })
}

let md: MarkdownIt | null = null

export function getMarkdownIt(): MarkdownIt {
  if (md) return md
  md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false })
  md.use(prism).use(mermaidPlugin).use(taskLists, { enabled: true, label: true })
  ;['warning', 'info', 'danger', 'tip', 'note'].forEach((t: string) => createCalloutContainer(md!, t))

  embedPlugin(md)

  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens: any[], idx: number) => {
    const token = tokens[idx]
    if (token.info.trim() === 'excalidraw') {
      const svgContent = token.content.trim()
      if (svgContent.startsWith('data:image/svg+xml;base64,')) {
        try {
          const decoded = atob(svgContent.replace('data:image/svg+xml;base64,', ''))
          return `<div class="excalidraw-embed">${decoded}</div>`
        } catch {
          return `<div class="excalidraw-embed">${svgContent}</div>`
        }
      }
      return `<div class="excalidraw-embed">${svgContent}</div>`
    }
    return defaultFence ? defaultFence(tokens, idx, {} as any, {} as any, {} as any) : ''
  }

  return md
}

export function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(getMarkdownIt().render(text), PURIFY_CONFIG)
  } catch {
    return '<p>Failed to render markdown</p>'
  }
}
