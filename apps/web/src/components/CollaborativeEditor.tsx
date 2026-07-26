import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import * as Y from 'yjs'
import { yCollab } from 'y-codemirror.next'
import { WebsocketProvider } from 'y-websocket'

// Syntax highlighting theme (stays same for dark/light; CSS vars handle background)
const cmHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--cm-keyword)' },
  { tag: tags.string, color: 'var(--cm-string)' },
  { tag: tags.comment, color: 'var(--color-text-muted)', fontStyle: 'italic' },
  { tag: tags.variableName, color: 'var(--cm-attr)' },
  { tag: tags.function(tags.variableName), color: 'var(--cm-function)' },
  { tag: tags.typeName, color: 'var(--cm-type)' },
  { tag: tags.tagName, color: 'var(--cm-tag)' },
  { tag: tags.attributeName, color: 'var(--cm-attr)' },
  { tag: tags.attributeValue, color: 'var(--cm-string)' },
  { tag: tags.number, color: 'var(--cm-number)' },
  { tag: tags.bool, color: 'var(--cm-bool)' },
  { tag: tags.null, color: 'var(--cm-null)' },
  { tag: tags.link, color: 'var(--color-primary)' },
  { tag: tags.url, color: 'var(--color-primary)', textDecoration: 'underline' },
  { tag: tags.heading, color: 'var(--cm-heading)', fontWeight: 'bold' },
  { tag: tags.strong, color: 'var(--color-text)', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'var(--color-text)', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: 'var(--color-text-muted)', textDecoration: 'line-through' },
  { tag: tags.meta, color: 'var(--color-text-muted)' },
  { tag: tags.processingInstruction, color: 'var(--color-text-muted)' },
  { tag: tags.quote, color: 'var(--color-text-muted)' },
  { tag: tags.deleted, color: 'var(--color-danger)' },
  { tag: tags.inserted, color: 'var(--color-success)' },
])

// Base CM theme — uses `transparent` / inherited so CSS vars from editor.css show through
const baseTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'inherit',
  },
  '.cm-content': {
    caretColor: 'inherit',
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
    fontSize: '14px',
    lineHeight: '1.6',
    padding: '0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'inherit',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-selection) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent', // handled by .cm-activeLine in editor.css
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--color-selection)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--color-surface-alt)',
    outline: '1px solid var(--color-primary)',
  },
  '.cm-nonmatchingBracket': {
    color: 'var(--color-danger)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent', // handled by editor.css
    color: 'inherit',
    border: 'none',
    borderRight: 'none',
    minWidth: '42px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'inherit',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-btn-default)',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
    borderRadius: '3px',
    padding: '0 4px',
    fontSize: '11px',
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--color-surface-alt)',
    outline: '1px solid var(--color-primary)',
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'var(--color-selection)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  },
  '.cm-panel': {
    backgroundColor: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    padding: '6px 10px',
  },
  '.cm-panel input': {
    backgroundColor: 'var(--color-input-bg)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  '.cm-panel label': {
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  '.cm-panel button': {
    backgroundColor: 'var(--color-btn-default)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-btn-default-text)',
    padding: '4px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  '.cm-panel button:hover': {
    backgroundColor: 'var(--color-btn-default-hover)',
  },
}, { dark: false })

interface CollaborativeEditorProps {
  documentId: string
  initialContent?: string
  readOnly?: boolean
  shareToken?: string
  onContentChange?: (content: string) => void
  onCursorChange?: (line: number, col: number) => void
  onDocStats?: (stats: { words: number; chars: number; lines: number }) => void
  onConnectionChange?: (status: 'connected' | 'connecting' | 'disconnected') => void
  onScrollRatio?: (ratio: number) => void
}

export function CollaborativeEditor({
  documentId,
  initialContent = '',
  readOnly = false,
  shareToken,
  onContentChange,
  onCursorChange,
  onDocStats,
  onConnectionChange,
  onScrollRatio,
}: CollaborativeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    // Create Y.Doc
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('markdown')

    // Initialize with content if provided and text is empty
    if (initialContent && ytext.length === 0) {
      ytext.insert(0, initialContent)
    }

    // Setup WebSocket provider — connect via nginx /socket path
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/socket`
    const docId = `doc-${documentId}`

    // y-websocket builds URL as wsUrl/docId, but our server expects ?docid=
    // So use wsUrl without room path and pass docid as a param
    const provider = new WebsocketProvider(wsUrl, docId, ydoc, {
      params: {
        docid: docId,
        ...(shareToken ? { token: shareToken } : {}),
      },
    })

    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected')
      if (event.status === 'connected') {
        setError(null)
      }
      if (onConnectionChange) {
        onConnectionChange(event.status as 'connected' | 'connecting' | 'disconnected')
      }
    })

    provider.on('connection-error', (event: any) => {
      setError(`Connection failed: ${event?.message || 'Unknown error'}`)
      setIsConnected(false)
    })

    // Calculate document stats
    function calcStats(doc: string) {
      const lines = doc.split('\n')
      const words = doc.trim() ? doc.trim().split(/\s+/).length : 0
      const chars = doc.length
      return { words, chars, lines: lines.length }
    }

    // Create extensions
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(cmHighlightStyle),
      baseTheme,
      yCollab(ytext, provider.awareness, {
        undoManager: new Y.UndoManager(ytext),
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onContentChange) {
          const text = update.state.doc.toString()
          onContentChange(text)
          if (onDocStats) {
            onDocStats(calcStats(text))
          }
        }
        if (update.selectionSet && onCursorChange) {
          const pos = update.state.selection.main.head
          const line = update.state.doc.lineAt(pos)
          onCursorChange(line.number, pos - line.from + 1)
        }
      }),
      EditorState.readOnly.of(readOnly),
    ]

    // Create editor state with Yjs collaboration
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions,
    })

    // Create editor view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    // Initial stats
    if (onDocStats) {
      onDocStats(calcStats(ytext.toString()))
    }

    // Listen for format-command events from toolbar
    function handleFormatCommand(e: Event) {
      const detail = (e as CustomEvent).detail as Record<string, unknown>
      if (!detail) return
      const v = viewRef.current!
      const { from, to } = v.state.selection.main

      if (detail.action === 'undo') { undo(v); return }
      if (detail.action === 'redo') { redo(v); return }
      if (detail.action === 'find') { openSearchPanel(v); return }

      if (detail.action === 'wrap' && detail.wrapper) {
        const wrapper = detail.wrapper as string | { left: string; right: string }
        const left = typeof wrapper === 'string' ? wrapper : wrapper.left
        const right = typeof wrapper === 'string' ? wrapper : wrapper.right

        if (from !== to) {
          // Wrap selected text
          const selected = v.state.sliceDoc(from, to)
          v.dispatch({
            changes: { from, to, insert: `${left}${selected}${right}` },
            selection: { anchor: from, head: to + left.length + right.length },
            scrollIntoView: true,
          })
        } else {
          const ph = (detail.placeholder as string) || 'text'
          v.dispatch({
            changes: { from, insert: `${left}${ph}${right}` },
            selection: { anchor: from + left.length, head: from + left.length + ph.length },
            scrollIntoView: true,
          })
        }
        return
      }

      if (detail.action === 'prefix' && detail.prefix) {
        const prefix = detail.prefix as string
        const line = v.state.doc.lineAt(from)
        if (from !== to) {
          // Prefix each selected line
          const selected = v.state.sliceDoc(from, to)
          const lines = selected.split('\n')
          const newLines = lines.map((l) => prefix + l).join('\n')
          v.dispatch({
            changes: { from, to, insert: newLines },
            selection: { anchor: from, head: from + newLines.length },
            scrollIntoView: true,
          })
        } else {
          const ph = (detail.placeholder as string) || ''
          v.dispatch({
            changes: { from: line.from, insert: prefix + (ph || line.text) + '\n' },
            selection: { anchor: line.from + prefix.length, head: line.from + prefix.length + (ph || line.text).length },
            scrollIntoView: true,
          })
        }
        return
      }

      if (detail.action === 'insert' && detail.placeholder) {
        v.dispatch({
          changes: { from, insert: detail.placeholder as string },
          selection: { anchor: from + (detail.placeholder as string).length },
          scrollIntoView: true,
        })
      }
    }

    window.document.addEventListener('format-command', handleFormatCommand)

    // Scroll sync: emit scroll ratio
    let scrollHandler: (() => void) | undefined
    if (onScrollRatio) {
      scrollHandler = () => {
        const scroller = view.scrollDOM
        const ratio = scroller.scrollHeight > scroller.clientHeight
          ? scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight)
          : 0
        onScrollRatio(ratio)
      }
      view.scrollDOM.addEventListener('scroll', scrollHandler)
    }

    // Cleanup
    return () => {
      window.document.removeEventListener('format-command', handleFormatCommand)
      if (scrollHandler) view.scrollDOM.removeEventListener('scroll', scrollHandler)
      provider.destroy()
      view.destroy()
    }
  }, [documentId, initialContent, readOnly, shareToken, onContentChange, onCursorChange, onDocStats])

  return (
    <div className="editor-wrapper">
      <div
        ref={editorRef}
        className="editor-container"
        style={{
          height: '100%',
          overflow: 'auto',
        }}
      />
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'var(--color-warning-bg)',
          border: '1px solid var(--color-warning)',
          color: 'var(--color-warning)',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 10,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
