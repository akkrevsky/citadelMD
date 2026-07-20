import React from 'react'

interface Tab {
  id: string
  label: string
  path?: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => onTabSelect(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              onTabClose(tab.id)
            }}
            title="Close"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path d="M4.72 4.72a.75.75 0 011.06 0L8 6.94l2.22-2.22a.75.75 0 111.06 1.06L9.06 8l2.22 2.22a.75.75 0 11-1.06 1.06L8 9.06l-2.22 2.22a.75.75 0 01-1.06-1.06L6.94 8 4.72 5.78a.75.75 0 010-1.06z"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
