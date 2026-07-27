import React from 'react'

export interface StatusBarProps {
  words?: number
  chars?: number
  lines?: number
  cursorLine?: number
  cursorCol?: number
  fileName?: string
  isConnected?: boolean
  connectionStatus?: 'connected' | 'disconnected' | 'connecting'
  /** When false, hide the WebSocket connection indicator (e.g. Excalidraw). */
  showConnection?: boolean
  readTime?: number
  hasUncommittedChanges?: boolean
  modeLabel?: string
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
  showConnection = true,
  readTime,
  hasUncommittedChanges = false,
  modeLabel,
}: StatusBarProps) {
  const status = isConnected ? 'connected' : connectionStatus
  const showStats = words !== undefined || chars !== undefined || lines !== undefined
  const showCursor = cursorLine !== undefined && cursorCol !== undefined

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {fileName && (
          <span className="status-bar-item status-bar-filename">{fileName}</span>
        )}
        {modeLabel && (
          <span className="status-bar-item">
            <span className="value">{modeLabel}</span>
          </span>
        )}
        {showStats && (
          <>
            {words !== undefined && (
              <span className="status-bar-item">
                <span className="label">Words </span>
                <span className="value">{words.toLocaleString()}</span>
              </span>
            )}
            {chars !== undefined && (
              <span className="status-bar-item">
                <span className="label">Chars </span>
                <span className="value">{chars.toLocaleString()}</span>
              </span>
            )}
            {lines !== undefined && (
              <span className="status-bar-item">
                <span className="label">Lines </span>
                <span className="value">{lines.toLocaleString()}</span>
              </span>
            )}
          </>
        )}
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
        {showCursor && (
          <span className="status-bar-item">
            <span className="value">Ln {cursorLine}, Col {cursorCol}</span>
          </span>
        )}
        {showConnection && (
          <span className="status-bar-connection">
            <span className={`status-dot ${status}`} />
            <span className="value">
              {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Disconnected'}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
