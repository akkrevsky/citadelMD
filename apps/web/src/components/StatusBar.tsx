import React from 'react'

export interface StatusBarProps {
  words: number
  chars: number
  lines: number
  cursorLine: number
  cursorCol: number
  fileName?: string
  isConnected?: boolean
  connectionStatus?: 'connected' | 'disconnected' | 'connecting'
  readTime?: number
  hasUncommittedChanges?: boolean
}

export function StatusBar({
  words,
  chars,
  lines,
  cursorLine,
  cursorCol,
  fileName,
  isConnected = false,
  connectionStatus = 'disconnected',
  readTime,
  hasUncommittedChanges = false,
}: StatusBarProps) {
  const status = isConnected ? 'connected' : connectionStatus

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {fileName && (
          <span className="status-bar-item status-bar-filename">{fileName}</span>
        )}
        <span className="status-bar-item">
          <span className="label">Words </span>
          <span className="value">{words.toLocaleString()}</span>
        </span>
        <span className="status-bar-item">
          <span className="label">Chars </span>
          <span className="value">{chars.toLocaleString()}</span>
        </span>
        <span className="status-bar-item">
          <span className="label">Lines </span>
          <span className="value">{lines.toLocaleString()}</span>
        </span>
      </div>

      <div className="status-bar-right">
        {hasUncommittedChanges && (
          <span className="unsaved-badge" title="Uncommitted changes">
            <span className="unsaved-dot">●</span> Unsaved
          </span>
        )}
        {readTime !== undefined && (
          <span className="status-bar-item">
            <span className="value">~{readTime} min read</span>
          </span>
        )}
        <span className="status-bar-item">
          <span className="value">Ln {cursorLine}, Col {cursorCol}</span>
        </span>
        <span className="status-bar-connection">
          <span className={`status-dot ${status}`} />
          <span className="value">
            {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Disconnected'}
          </span>
        </span>
      </div>
    </div>
  )
}
