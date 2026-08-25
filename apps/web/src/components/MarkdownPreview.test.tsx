import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarkdownPreview } from './MarkdownPreview'

vi.mock('../api-client.js', () => ({
  api: {
    resolveDocumentPath: vi.fn(),
  },
}))

import { api } from '../api-client.js'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPreview(content: string, props: Partial<Parameters<typeof MarkdownPreview>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MarkdownPreview content={content} {...props} />
    </MemoryRouter>,
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
