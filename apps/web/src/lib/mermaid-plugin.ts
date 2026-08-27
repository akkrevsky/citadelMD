/**
 * markdown-it fence plugin for Mermaid diagrams.
 *
 * ```mermaid ... ``` fences render as a placeholder div whose content is the
 * escaped diagram source. The diagram itself is drawn client-side by the
 * mermaid library in a second pass (see mermaid-render.ts), after DOMPurify
 * has sanitized the markdown output.
 */
import type MarkdownIt from 'markdown-it'

export function mermaidBlockPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'mermaid') {
      const src = md.utils.escapeHtml(token.content)
      return `<div class="mermaid">${src}</div>`
    }
    return defaultFence?.(tokens, idx, options, env, self) ?? ''
  }
}
