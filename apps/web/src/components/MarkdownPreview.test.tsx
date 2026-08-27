import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarkdownPreview } from './MarkdownPreview'
import { ThemeProvider, useTheme } from '../hooks/useTheme.js'

vi.mock('../api-client.js', () => ({
  api: {
    resolveDocumentPath: vi.fn(),
  },
}))

// Virtual-ish replacement of the heavy diagram library: jsdom can't lay out
// real mermaid SVGs, so tests only assert the activation contract.
const { defaultRun } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultRun: async (options: any) => {
    const nodes = (options as { nodes: HTMLElement[] }).nodes
    for (const node of nodes) {
      node.innerHTML = '<svg class="fake-svg"></svg>'
      node.setAttribute('data-processed', 'true')
    }
  },
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn(defaultRun),
  },
}))

import { api } from '../api-client.js'
import mermaid from 'mermaid'

beforeEach(() => {
  // useTheme reads matchMedia at provider mount; jsdom does not have it.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // Restore the default diagram-inserting implementation, so per-test
  // overrides of mermaid.run never leak into the next test.
  vi.mocked(mermaid.run).mockImplementation(defaultRun)
  vi.unstubAllGlobals()
})

function renderPreview(content: string, props: Partial<Parameters<typeof MarkdownPreview>[0]> = {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <MarkdownPreview content={content} {...props} />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

function ToggleHarness({ content }: { content: string }) {
  const { toggleTheme } = useTheme()
  return (
    <div>
      <button onClick={toggleTheme}>toggle-theme</button>
      <MarkdownPreview content={content} />
    </div>
  )
}

describe('MarkdownPreview document links', () => {
  it('resolves and navigates on doc-link click', async () => {
    vi.mocked(api.resolveDocumentPath).mockResolvedValue({
      id: 'doc-9',
      title: 'Note',
      kind: 'MARKDOWN',
    })

    renderPreview('[Note](folder/note.md)')
    fireEvent.click(screen.getByText('Note'))

    await waitFor(() =>
      expect(vi.mocked(api.resolveDocumentPath)).toHaveBeenCalledWith('folder/note.md'),
    )
  })

  it('decodes percent-encoded hrefs', async () => {
    vi.mocked(api.resolveDocumentPath).mockResolvedValue({ id: 'doc-9', title: 'N', kind: 'MARKDOWN' })

    renderPreview('[Note](<folder/my file.md>)')
    fireEvent.click(screen.getByText('Note'))

    await waitFor(() =>
      expect(vi.mocked(api.resolveDocumentPath)).toHaveBeenCalledWith('folder/my file.md'),
    )
  })

  it('reports resolution errors', async () => {
    vi.mocked(api.resolveDocumentPath).mockRejectedValue(new Error('Document not found'))
    const onLinkError = vi.fn()

    renderPreview('[Note](folder/missing.md)', { onLinkError })
    fireEvent.click(screen.getByText('Note'))

    await waitFor(() => expect(onLinkError).toHaveBeenCalled())
    expect(onLinkError.mock.calls[0][0]).toContain('folder/missing.md')
  })

  it('ignores self-links', async () => {
    renderPreview('[Me](folder/me.md)', { currentFilePath: 'folder/me.md' })
    fireEvent.click(screen.getByText('Me'))

    await new Promise((r) => setTimeout(r, 50))
    expect(vi.mocked(api.resolveDocumentPath)).not.toHaveBeenCalled()
  })

  it('does not intercept external links', async () => {
    renderPreview('[X](https://example.com)')
    fireEvent.click(screen.getByText('X'))

    await new Promise((r) => setTimeout(r, 50))
    expect(vi.mocked(api.resolveDocumentPath)).not.toHaveBeenCalled()
  })
})

describe('MarkdownPreview mermaid activation', () => {
  const DIAGRAM = '```mermaid\ngraph TD\nA-->B\n```'

  it('draws mermaid blocks after render', async () => {
    renderPreview(DIAGRAM)
    await waitFor(() => expect(document.querySelector('.mermaid svg')).not.toBeNull())
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict', theme: 'default' }),
    )
    expect(mermaid.run).toHaveBeenCalledTimes(1)
  })

  it('shows an error box when the diagram fails', async () => {
    vi.mocked(mermaid.run).mockImplementation(async () => {})
    renderPreview(DIAGRAM)
    await waitFor(() => expect(document.querySelector('.mermaid-error')).not.toBeNull())
    expect(document.querySelector('.mermaid-error pre')?.textContent).toContain('graph TD')
  })

  it('re-runs with the dark theme after a theme toggle', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <ToggleHarness content={DIAGRAM} />
        </MemoryRouter>
      </ThemeProvider>,
    )
    await waitFor(() => expect(document.querySelector('.mermaid svg')).not.toBeNull())

    fireEvent.click(screen.getByText('toggle-theme'))

    await waitFor(() => expect(mermaid.run).toHaveBeenCalledTimes(2))
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    )
  })
})
