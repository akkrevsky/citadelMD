import { useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderMarkdown } from '../lib/markdown-renderer.js'
import { api } from '../api-client.js'

interface MarkdownPreviewProps {
  content: string
  className?: string
  scrollRatio?: number
  /** File path of the document being previewed — self-links become no-ops. */
  currentFilePath?: string
  /** Called when an internal link cannot be resolved (renamed/moved target). */
  onLinkError?: (message: string) => void
}

export function MarkdownPreview({
  content,
  className = '',
  scrollRatio,
  currentFilePath,
  onLinkError,
}: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content])
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (scrollRatio == null || scrollRatio < 0 || !containerRef.current) return
    // The scrollable container is the parent .preview-wrapper, not .markdown-preview itself
    const scrollable = containerRef.current.parentElement
    if (!scrollable) return
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight
    if (maxScroll > 0) {
      scrollable.scrollTop = scrollRatio * maxScroll
    }
    // Content changes replace the DOM and reset the scroll position, so
    // re-apply the ratio after them too — otherwise the preview stays at
    // the top while typing at the bottom of a long document.
  }, [scrollRatio, content])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0) return
    const el = (e.target as HTMLElement).closest('a.doc-link')
    if (!el) return
    const href = (el as HTMLAnchorElement).getAttribute('href') ?? ''
    let path = href
    try {
      path = decodeURI(href)
    } catch {
      // keep raw href on malformed escape sequences
    }
    e.preventDefault()
    if (path === currentFilePath) return
    void api
      .resolveDocumentPath(path)
      .then((doc) => navigate(`/documents/${doc.id}/edit`, { state: { preview: true } }))
      .catch(() => onLinkError?.(`Не удалось открыть «${path}»`))
  }

  return (
    <div
      ref={containerRef}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
