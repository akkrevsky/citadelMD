import MarkdownIt from 'markdown-it'
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

let md: MarkdownIt | null = null

export function getMarkdownIt(): MarkdownIt {
  if (md) return md
  md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false })
  return md
}

export function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(getMarkdownIt().render(text), PURIFY_CONFIG)
  } catch {
    return '<p>Failed to render markdown</p>'
  }
}
