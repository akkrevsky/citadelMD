import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown-renderer.js'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content])

  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
