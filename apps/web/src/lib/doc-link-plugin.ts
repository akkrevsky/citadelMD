import type MarkdownIt from 'markdown-it'

/**
 * A markdown link href is a document path when it carries no scheme (no ':'),
 * is not an in-page anchor ('#') and is not root-absolute ('/'). linkify
 * output (https://…) and attachment URLs (/api/uploads/…) are excluded.
 */
export function isDocPath(href: string): boolean {
  if (!href) return false
  if (href.startsWith('/') || href.startsWith('#') || href.includes(':')) return false
  return true
}

/**
 * Marks internal document links ([Title](folder/name.md)) with the
 * `doc-link` class; MarkdownPreview intercepts clicks on them and
 * navigates inside the SPA. The href is left untouched.
 */
export function docLinkPlugin(md: MarkdownIt): void {
  const defaultLinkOpen = md.renderer.rules.link_open

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') ?? ''
    if (isDocPath(href)) {
      tokens[idx].attrSet('class', 'doc-link')
    }
    return (
      defaultLinkOpen?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options)
    )
  }
}
