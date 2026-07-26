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
    const el = containerRef.current
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      el.scrollTop = scrollRatio * maxScroll
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
