import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { RevisionTree } from './RevisionTree'

vi.mock('../api-client.js', () => ({
  api: {
    getRevisions: vi.fn(),
    getDiff: vi.fn(),
    getRevisionDiff: vi.fn(),
    restoreToRevision: vi.fn(),
  },
}))

import { api } from '../api-client.js'

const REVISIONS = [
  {
    sha: 'abcdef1234567890abcdef1234567890abcdef12',
    message: 'Second commit',
    authorName: 'Test User',
    date: '2026-08-21T10:00:00Z',
  },
  {
    sha: '1111111111111111111111111111111111111111',
    message: 'Initial commit',
    authorName: 'Test User',
    date: '2026-08-20T09:00:00Z',
  },
]

function mockLoadedRevisions() {
  vi.mocked(api.getRevisions).mockResolvedValue({ revisions: REVISIONS })
}

afterEach(() => {
  // RTL does not auto-cleanup without vitest globals enabled
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getDiff).mockResolvedValue({ diff: '' })
  vi.mocked(api.getRevisionDiff).mockResolvedValue('+added line\n-removed line\n context')
  vi.mocked(api.restoreToRevision).mockResolvedValue(undefined)
})

describe('RevisionTree', () => {
  it('lists revisions and the uncommitted changes section', async () => {
    mockLoadedRevisions()
    vi.mocked(api.getDiff).mockResolvedValue({ diff: '+wip line' })

    render(<RevisionTree documentId="doc-1" onRestore={vi.fn()} />)

    expect(await screen.findByText('Second commit')).toBeTruthy()
    expect(screen.getByText('Initial commit')).toBeTruthy()
    expect(screen.getByText('Незакоммиченные изменения')).toBeTruthy()
    expect(screen.getByText('abcdef1')).toBeTruthy()
  })

  it('loads and renders the diff when a revision is expanded', async () => {
    mockLoadedRevisions()

    render(<RevisionTree documentId="doc-1" onRestore={vi.fn()} />)
    fireEvent.click(await screen.findByText('Second commit'))

    await waitFor(() =>
      expect(vi.mocked(api.getRevisionDiff)).toHaveBeenCalledWith(
        'doc-1',
        'abcdef1234567890abcdef1234567890abcdef12',
      ),
    )
    expect(await screen.findByText('+added line')).toBeTruthy()
    expect(screen.getByText('-removed line')).toBeTruthy()
  })

  it('restores to the selected revision', async () => {
    mockLoadedRevisions()
    const onRestore = vi.fn()

    render(<RevisionTree documentId="doc-1" onRestore={onRestore} />)
    // The restore button lives inside the expanded revision body
    fireEvent.click(await screen.findByText('Second commit'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Откатить к этой версии' })[0])

    await waitFor(() =>
      expect(vi.mocked(api.restoreToRevision)).toHaveBeenCalledWith(
        'doc-1',
        'abcdef1234567890abcdef1234567890abcdef12',
      ),
    )
    expect(onRestore).toHaveBeenCalledWith('abcdef1234567890abcdef1234567890abcdef12')
  })

  it('shows the empty state when there are no commits and no uncommitted changes', async () => {
    vi.mocked(api.getRevisions).mockResolvedValue({ revisions: [] })

    render(<RevisionTree documentId="doc-1" onRestore={vi.fn()} />)

    expect(await screen.findByText(/Коммитов пока нет/)).toBeTruthy()
  })

  it('shows the error message when loading revisions fails', async () => {
    vi.mocked(api.getRevisions).mockRejectedValue(new Error('network down'))

    render(<RevisionTree documentId="doc-1" onRestore={vi.fn()} />)

    expect(await screen.findByText('network down')).toBeTruthy()
  })
})
