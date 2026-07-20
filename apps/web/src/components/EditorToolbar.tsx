import React, { useCallback } from 'react'

export type ViewMode = 'source' | 'split' | 'preview'

interface EditorToolbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onFormat: (type: string) => void
  fileName?: string
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
}

// SVG icons as inline components
const IconBold = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h4.5a3.5 3.5 0 0 1 2.175 6.18 3.75 3.75 0 0 1-1.925 6.32H4V2Zm2.1 5.1h2.4a1.5 1.5 0 0 0 0-3H6.1v3Zm0 4.8h2.8a1.7 1.7 0 0 0 0-3.4H6.1v3.4Z"/></svg>
const IconItalic = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h6v2H9.5l-3 8H9v2H3v-2h2.5l3-8H6V2Z"/></svg>
const IconStrikethrough = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 3H3v2h3.5v2H6v2h.5v2H3v2h5.5a3.5 3.5 0 0 0 0-7H9V5h4V3H8.5ZM3 9h5.5a1.5 1.5 0 0 1 0 3H3V9Z"/></svg>
const IconCode = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="m4.72 4.47-3.5 3.5a.75.75 0 0 0 0 1.06l3.5 3.5a.75.75 0 1 0 1.06-1.06L2.81 8.5l2.97-2.97a.75.75 0 0 0-1.06-1.06Zm6.5 0a.75.75 0 0 0-1.06 1.06L13.19 8.5l-2.97 2.97a.75.75 0 1 0 1.06 1.06l3.5-3.5a.75.75 0 0 0 0-1.06l-3.5-3.5Z"/></svg>
const IconQuote = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 3.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75ZM2.75 7.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z"/></svg>
const IconList = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 4.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2-1.25a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25v-.5ZM3 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2-.75a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25v-.5ZM3 13.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2-.75a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25v-.5Z"/></svg>
const IconOrderedList = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.3 1.4a.5.5 0 0 1 .2.6v2.5h.5a.5.5 0 0 1 0 1H2.5a.5.5 0 0 1 0-1H3V2.8l-.3.2a.5.5 0 0 1-.6-.8l1-.7a.5.5 0 0 1 .2 0Zm0 5.6a.5.5 0 0 1 .1.7L.8 11h2.7a.5.5 0 0 1 0 1H0a.5.5 0 0 1-.4-.8l2.9-3.7a.5.5 0 0 1 .8.5v1.7l.1-.1a.5.5 0 0 1 .6 0 12 12 0 0 1 .2.6ZM3.5 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm.4-4.5a.5.5 0 0 0-.4-.5H2.5a.5.5 0 0 0 0 1h.3l-1.6 2a.5.5 0 0 0 .4.8h2a.5.5 0 0 0 0-1H3l1.4-1.7a.5.5 0 0 0 .1-.6h.4ZM7.25 4a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25H7.5A.25.25 0 0 1 7.25 4V4Zm0 4a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25H7.5a.25.25 0 0 1-.25-.25v-.5Zm0 4a.25.25 0 0 1 .25-.25h4.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25H7.5a.25.25 0 0 1-.25-.25v-.5Z"/></svg>
const IconTaskList = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1H2V3Zm0 4.5h12v1H2v-1Zm0 4.5h12v1H2v-1Z"/></svg>
const IconLink = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="m7.78 4.28 1.5-1.5a3.25 3.25 0 1 1 4.6 4.6l-1.5 1.5a.75.75 0 0 1-1.06-1.06l1.5-1.5a1.75 1.75 0 0 0-2.47-2.47l-1.5 1.5a.75.75 0 0 1-1.06-1.06Zm-3.1 3.1 1.5-1.5a.75.75 0 0 1 1.06 1.06l-1.5 1.5a1.75 1.75 0 0 0 2.47 2.47l1.5-1.5a.75.75 0 0 1 1.06 1.06l-1.5 1.5a3.25 3.25 0 1 1-4.6-4.6Z"/></svg>
const IconTable = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM3.5 3a.5.5 0 0 0-.5.5V5h2V3h-1.5ZM5 6H3v2h2V6Zm0 3H3v2h2V9Zm1 2V9h2v2H6Zm0-3h2V6H6v2Zm0-4v2h2V5H6Zm3 7V9h2v2H9Zm0-3V6h2v2H9Zm0-4h2V3H9v2Zm3 8h.5a.5.5 0 0 0 .5-.5V9h-2v2h1v1Zm.5-9H12v2h2V5h-.5Z"/></svg>
const IconImage = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-9ZM3 3a.5.5 0 0 0-.5.5v5.69l2.8-2.09a1.5 1.5 0 0 1 1.8 0l1.9 1.42 1.1-1.1a1.5 1.5 0 0 1 2.12 0l1.28 1.28V3.5A.5.5 0 0 0 13 3H3Zm-.5 8.31V12.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1.69l-2.22-2.22a.5.5 0 0 0-.7 0l-1.1 1.1a.75.75 0 0 1-1.06 0l-1.9-1.42a.5.5 0 0 0-.6 0L2.5 11.31Z"/></svg>
const IconHorizontalRule = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Z"/></svg>
const IconUndo = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.5a.75.75 0 0 1 .75.75v2.19l3.72-3.72A.75.75 0 0 1 10 2.75V4h.75a4.75 4.75 0 0 1 0 9.5h-4a.75.75 0 0 1 0-1.5h4a3.25 3.25 0 0 0 0-6.5H10v1.25a.75.75 0 0 1-1.28.53L5.03 4.53 5.25 4.28V3.25a.75.75 0 0 1-.75-.75Z"/></svg>
const IconRedo = () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 2.5a.75.75 0 0 0-.75.75v2.19L7.03 2.22A.75.75 0 0 0 6 2.75V4h-.75a4.75 4.75 0 0 0 0 9.5h4a.75.75 0 0 0 0-1.5h-4a3.25 3.25 0 0 1 0-6.5H6v1.25a.75.75 0 0 0 1.28.53l3.72-3.72L10.75 4.5V3.25a.75.75 0 0 0 .75-.75Z"/></svg>

export function EditorToolbar({ viewMode, onViewModeChange, onFormat, fileName, theme = 'dark', onToggleTheme }: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      {/* Formatting group */}
      <div className="toolbar-group">
        <button className="toolbar-btn" title="Undo" onClick={() => onFormat('undo')}><IconUndo /></button>
        <button className="toolbar-btn" title="Redo" onClick={() => onFormat('redo')}><IconRedo /></button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" title="Bold (Ctrl+B)" onClick={() => onFormat('bold')}><IconBold /></button>
        <button className="toolbar-btn" title="Italic (Ctrl+I)" onClick={() => onFormat('italic')}><IconItalic /></button>
        <button className="toolbar-btn" title="Strikethrough" onClick={() => onFormat('strikethrough')}><IconStrikethrough /></button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn text-btn h1" title="Heading 1" onClick={() => onFormat('h1')}>H1</button>
        <button className="toolbar-btn text-btn h2" title="Heading 2" onClick={() => onFormat('h2')}>H2</button>
        <button className="toolbar-btn text-btn h3" title="Heading 3" onClick={() => onFormat('h3')}>H3</button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" title="Code" onClick={() => onFormat('code')}><IconCode /></button>
        <button className="toolbar-btn" title="Blockquote" onClick={() => onFormat('quote')}><IconQuote /></button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" title="Unordered list" onClick={() => onFormat('ul')}><IconList /></button>
        <button className="toolbar-btn" title="Ordered list" onClick={() => onFormat('ol')}><IconOrderedList /></button>
        <button className="toolbar-btn" title="Task list" onClick={() => onFormat('task')}><IconTaskList /></button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" title="Link" onClick={() => onFormat('link')}><IconLink /></button>
        <button className="toolbar-btn" title="Image" onClick={() => onFormat('image')}><IconImage /></button>
        <button className="toolbar-btn" title="Table" onClick={() => onFormat('table')}><IconTable /></button>
        <button className="toolbar-btn" title="Horizontal rule" onClick={() => onFormat('hr')}><IconHorizontalRule /></button>
      </div>

      {/* View mode toggle */}
      <div className="toolbar-right">
        <div className="view-mode-group">
          <button
            className={`view-mode-btn ${viewMode === 'source' ? 'active' : ''}`}
            onClick={() => onViewModeChange('source')}
            title="Source view"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M4.72 4.47l-3.5 3.5a.75.75 0 000 1.06l3.5 3.5a.75.75 0 101.06-1.06L2.81 8.5l2.97-2.97a.75.75 0 00-1.06-1.06zm6.5 0a.75.75 0 10-1.06 1.06L13.19 8.5l-2.97 2.97a.75.75 0 101.06 1.06l3.5-3.5a.75.75 0 000-1.06l-3.5-3.5z"/>
            </svg>
            Code
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => onViewModeChange('split')}
            title="Split view"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9zm1.5-.5a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-9a.5.5 0 00-.5-.5h-9zM8 3v10h.5V3H8z"/>
            </svg>
            Split
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => onViewModeChange('preview')}
            title="Preview"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M8 2C4.5 2 1.5 4.5 0 8c1.5 3.5 4.5 6 8 6s6.5-2.5 8-6c-1.5-3.5-4.5-6-8-6zm0 10.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-2a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
            </svg>
            Preview
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Theme toggle */}
        <button
          className="toolbar-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
              <path d="M8 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 1zm0 10a3 3 0 100-6 3 3 0 000 6zm0 1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 12.5zm6.25-4.75a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5h1.5zM3.25 8a.75.75 0 01-.75.75H1a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zm9.72-4.97a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM5.15 11.85a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM4.97 3.15a.75.75 0 01-1.06 0L2.85 2.09a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 010 1.06zm6.88 8.7a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
              <path d="M9.6 1.4a.75.75 0 00-.84-.17 6.5 6.5 0 103.5 8.93.75.75 0 00-1.04-1.02 4.5 4.5 0 11-3.2-7.44l.24-.2.34-.1z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
