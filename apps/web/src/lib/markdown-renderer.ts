import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import DOMPurify from 'dompurify'
import type { Config as DOMPurifyConfig } from 'dompurify'
import Prism from 'prismjs'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import taskLists from 'markdown-it-task-lists'
import { excalidrawBlockPlugin } from './excalidraw-plugin.js'
import { docLinkPlugin } from './doc-link-plugin.js'
import 'katex/dist/katex.min.css'

const PURIFY_CONFIG: DOMPurifyConfig = {
  ADD_ATTR: ['id'],
  ADD_TAGS: [
    'input', // task-list checkboxes
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'g', 'defs', 'use', 'image', 'text', 'tspan', 'marker',
    'stop', 'linearGradient', 'radialGradient', 'clipPath', 'mask',
    'span', 'math', 'annotation',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'type', 'checked', 'disabled',
    'href', 'src', 'alt', 'width', 'height',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r',
    'x', 'y', 'dx', 'dy', 'rx', 'ry', 'points', 'transform',
    'xmlns', 'preserveAspectRatio', 'style', 'aria-hidden',
  ],
  ALLOW_DATA_ATTR: false,
}

let md: MarkdownIt | null = null

export function getMarkdownIt(): MarkdownIt {
  if (md) return md
  md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    // Syntax highlighting for fenced code blocks. Prism escapes the code
    // itself; DOMPurify runs over the final HTML as a second layer.
    highlight: (str, lang) => {
      if (lang && lang in Prism.languages) {
        try {
          return Prism.highlight(str, Prism.languages[lang], lang)
        } catch {
          // malformed code — fall through to default escaping
        }
      }
      return '' // empty string -> markdown-it applies its own escaping
    },
  })
  md.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false } })
  // Task lists: `- [ ]` / `- [x]`. Checkboxes are read-only in the preview
  // (editing happens in the source pane).
  md.use(taskLists, { enabled: false, label: true, labelAfter: true })
  md.use(excalidrawBlockPlugin)
  md.use(docLinkPlugin)
  return md
}

export function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(getMarkdownIt().render(text), PURIFY_CONFIG)
  } catch (error) {
    console.warn('[markdown] failed to render:', error)
    return '<p>Failed to render markdown</p>'
  }
}
