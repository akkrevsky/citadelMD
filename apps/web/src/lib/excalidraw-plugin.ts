import type MarkdownIt from 'markdown-it'

function decodeSvgDataUrl(dataUrl: string): string | null {
  const prefix = 'data:image/svg+xml;base64,'
  if (!dataUrl.startsWith(prefix)) return null
  try {
    const base64 = dataUrl.slice(prefix.length).trim()
    return decodeURIComponent(
      Array.from(atob(base64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    )
  } catch {
    return null
  }
}

function renderExcalidrawFence(content: string): string {
  const raw = content.trim()
  if (!raw) {
    return '<div class="excalidraw-embed excalidraw-embed-empty">Empty diagram</div>'
  }

  if (raw.startsWith('data:image/svg+xml;base64,')) {
    const svg = decodeSvgDataUrl(raw)
    if (svg) return `<div class="excalidraw-embed">${svg}</div>`
  }

  if (raw.startsWith('<svg')) {
    return `<div class="excalidraw-embed">${raw}</div>`
  }

  return '<div class="excalidraw-embed excalidraw-embed-invalid">Invalid diagram</div>'
}

export function excalidrawBlockPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'excalidraw') {
      return renderExcalidrawFence(token.content)
    }
    return defaultFence?.(tokens, idx, options, env, self) ?? ''
  }
}
