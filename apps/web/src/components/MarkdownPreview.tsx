import { useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderMarkdown } from '../lib/markdown-renderer.js'
import { api } from '../api-client.js'
import { useTheme } from '../hooks/useTheme.js'
import { activateMermaidBlocks } from '../lib/mermaid-render.js'

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
  const { theme } = useTheme()

  // Draw mermaid diagrams after the sanitized HTML lands in the DOM.
  // runIdRef invalidates stale async runs (content changed mid-render);
  // pendingRef serializes so only one mermaid.run is ever in flight.
  const runIdRef = useRef(0)
  const pendingRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const id = ++runIdRef.current
    const run = async () => {
      await pendingRef.current
      await activateMermaidBlocks(root, theme, { isCurrent: () => id === runIdRef.current })
    }
    pendingRef.current = run()
    void pendingRef.current
  }, [content, theme])

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
