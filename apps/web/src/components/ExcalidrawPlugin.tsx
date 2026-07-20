import type MarkdownIt from 'markdown-it'

export function excalidrawBlockPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'excalidraw') {
      const svgContent = token.content.trim()
      if (svgContent.startsWith('data:image/svg+xml;base64,')) {
        const base64 = svgContent.replace('data:image/svg+xml;base64,', '')
        const decoded = atob(base64)
        return `<div class="excalidraw-embed">${decoded}</div>`
      }
      return `<div class="excalidraw-embed">${svgContent}</div>`
    }
    return defaultFence?.(tokens, idx, options, env, self) ?? ''
  }
}
