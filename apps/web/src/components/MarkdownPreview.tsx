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
  }, [scrollRatio])

  return (
    <div
      ref={containerRef}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
