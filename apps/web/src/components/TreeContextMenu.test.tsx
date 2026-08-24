import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TreeContextMenu } from './TreeContextMenu'

afterEach(() => {
  cleanup()
})

function renderMenu(items: Parameters<typeof TreeContextMenu>[0]['items'], x = 10, y = 10) {
  const onClose = vi.fn()
  render(<TreeContextMenu x={x} y={y} items={items} onClose={onClose} />)
  return { onClose }
}

describe('TreeContextMenu', () => {
  it('renders items and calls onSelect then onClose on click', () => {
    const onSelect = vi.fn()
    const { onClose } = renderMenu([
      { label: 'Open', onSelect },
      { label: 'Delete', danger: true, onSelect: vi.fn() },
    ])

    fireEvent.click(screen.getByText('Open'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks danger items and renders separators', () => {
    const onDelete = vi.fn()
    renderMenu([
      { label: 'Open', onSelect: vi.fn() },
      { separator: true },
      { label: 'Delete', danger: true, onSelect: onDelete },
    ])

    expect(screen.getByText('Delete').className).toContain('tab-context-menu-danger')
    expect(document.querySelector('.tab-context-menu-separator')).toBeTruthy()
  })

  it('closes on outside mousedown but not on inside mousedown', () => {
    const { onClose } = renderMenu([{ label: 'Open', onSelect: vi.fn() }])

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByText('Open'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const { onClose } = renderMenu([{ label: 'Open', onSelect: vi.fn() }])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders at extreme coordinates without throwing', () => {
    expect(() => renderMenu([{ label: 'Open', onSelect: vi.fn() }], 9999, 9999)).not.toThrow()
  })
})
