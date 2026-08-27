import { describe, it, expect, vi } from 'vitest'
import { activateMermaidBlocks, type MermaidModule } from './mermaid-render.js'

function makeRoot(sourceHtml: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = sourceHtml
  return root
}

function fakeMermaid(overrides: Partial<MermaidModule> = {}) {
  const initialize = vi.fn()
  const run = vi.fn(async (options: any) => {
    const nodes = (options as { nodes: HTMLElement[] }).nodes
    for (const node of nodes) {
      node.innerHTML = '<svg class="fake-svg"></svg>'
      node.setAttribute('data-processed', 'true')
    }
  })
  return {
    module: { default: { initialize, run, ...overrides } as MermaidModule },
    initialize,
    run,
  }
}

describe('activateMermaidBlocks', () => {
  it('does nothing when no .mermaid nodes exist', async () => {
    const loadMermaid = vi.fn()
    const root = makeRoot('<p>no diagrams</p>')
    await activateMermaidBlocks(root, 'light', { loadMermaid })
    expect(loadMermaid).not.toHaveBeenCalled()
  })

  it('initializes with the light theme and runs on the nodes', async () => {
    const { module, initialize, run } = fakeMermaid()
    const root = makeRoot('<div class="mermaid">graph TD\n A--&gt;B\n</div>')

    await activateMermaidBlocks(root, 'light', { loadMermaid: async () => module })

    expect(initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
    })
    const node = root.querySelector('.mermaid') as HTMLElement
    expect(run).toHaveBeenCalledWith({ nodes: [node], suppressErrors: true })
    expect(node.innerHTML).toContain('fake-svg')
  })

  it('initializes with the dark theme when theme is dark', async () => {
    const { module, initialize } = fakeMermaid()
    const root = makeRoot('<div class="mermaid">graph TD</div>')

    await activateMermaidBlocks(root, 'dark', { loadMermaid: async () => module })

    expect(initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
    })
  })

  it('shows an error box for nodes without an svg child', async () => {
    const { module } = fakeMermaid({ run: vi.fn(async () => {}) })
    const root = makeRoot('<div class="mermaid">graph TD\n A--&gt;</div>')

    await activateMermaidBlocks(root, 'light', { loadMermaid: async () => module })

    const errorBox = root.querySelector('.mermaid-error')
    expect(errorBox).not.toBeNull()
    expect(errorBox?.querySelector('pre')?.textContent).toContain('graph TD')
  })

  it('re-run restores the source and clears data-processed', async () => {
    const captured: string[] = []
    const initialize = vi.fn()
    const run = vi.fn(async ({ nodes }: { nodes: HTMLElement[] }) => {
      for (const node of nodes) {
        captured.push(node.innerHTML)
        node.innerHTML = '<svg class="fake-svg"></svg>'
        node.setAttribute('data-processed', 'true')
      }
    })
    const module = { default: { initialize, run } as MermaidModule }
    const root = makeRoot('<div class="mermaid">graph TD\n A--&gt;B\n</div>')
    const node = root.querySelector('.mermaid') as HTMLElement

    await activateMermaidBlocks(root, 'light', { loadMermaid: async () => module })
    expect(captured[0]).toContain('graph TD')

    await activateMermaidBlocks(root, 'dark', { loadMermaid: async () => module })
    // The source seen by the second run is the restored original, not the SVG.
    expect(captured[1]).toContain('graph TD')
    expect(captured[1]).not.toContain('fake-svg')
    expect(node.innerHTML).toContain('fake-svg') // re-rendered again
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
  })

  it('aborts before running when isCurrent returns false', async () => {
    const { module, initialize, run } = fakeMermaid()
    const root = makeRoot('<div class="mermaid">graph TD</div>')

    await activateMermaidBlocks(root, 'light', {
      loadMermaid: async () => module,
      isCurrent: () => false,
    })

    expect(initialize).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('shows error boxes without throwing when the dynamic import fails', async () => {
    const root = makeRoot('<div class="mermaid">graph TD</div>')
    const loadMermaid = vi.fn(async () => {
      throw new Error('chunk load failed')
    })

    await expect(
      activateMermaidBlocks(root, 'light', { loadMermaid }),
    ).resolves.toBeUndefined()

    expect(root.querySelector('.mermaid-error')).not.toBeNull()
  })
})
