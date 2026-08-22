import { useMemo, useRef, useEffect } from 'react'
import { renderMarkdown } from '../lib/markdown-renderer.js'

interface MarkdownPreviewProps {
  content: string
  className?: string
  scrollRatio?: number
}

export function MarkdownPreview({ content, className = '', scrollRatio }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content])
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={containerRef}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
