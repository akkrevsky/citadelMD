import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import HomePage from './HomePage'

vi.mock('../api-client.js', () => ({
  api: {
    getTree: vi.fn().mockResolvedValue([]),
  },
}))

// jsdom has no ResizeObserver — AsciiGalaxy uses it in an effect
class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          element={
            <Outlet
              context={{
                selectedFolderId: null,
                setSelectedFolderId: () => {},
                refreshTree: () => {},
              }}
            />
          }
        >
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage agent/chat toggle', () => {
  it('shows the agent iframe by default and hides the chat', () => {
    renderHome()

    const frame = screen.getByTestId('agent-frame')
    expect(frame.getAttribute('src')).toContain(':8082/')
    expect(screen.getByTestId('agent-panel').hidden).toBe(false)
    expect(screen.getByTestId('chat-panel').hidden).toBe(true)
  })

  it('switches to the chat panel on «Чат»', () => {
    renderHome()

    fireEvent.click(screen.getByRole('tab', { name: 'Чат' }))

    expect(screen.getByTestId('chat-panel').hidden).toBe(false)
    expect(screen.getByPlaceholderText('Спросите ИИ…')).toBeTruthy()
    expect(screen.getByTestId('agent-panel').hidden).toBe(true)
  })

  it('switches back to the agent panel', () => {
    renderHome()

    fireEvent.click(screen.getByRole('tab', { name: 'Чат' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Агент' }))

    expect(screen.getByTestId('agent-panel').hidden).toBe(false)
    expect(screen.getByTestId('chat-panel').hidden).toBe(true)
  })

  it('keeps the create-document button on the home view', () => {
    renderHome()

    expect(screen.getByRole('button', { name: 'Create New Document' })).toBeTruthy()
  })
})
