/**
 * Client-side activation of Mermaid diagram blocks.
 *
 * markdown-renderer emits `.mermaid` placeholder divs with the escaped
 * diagram source (see mermaid-plugin.ts). This module draws them in a
 * second pass, after DOMPurify has sanitized the markdown output. The
 * mermaid library is loaded lazily and only when at least one block exists.
 */

/** Minimal structural interface — compatible with mermaid's default export. */
export interface MermaidModule {
  initialize(config: { startOnLoad: boolean; securityLevel: string; theme: string }): void
  run(options: { nodes: HTMLElement[]; suppressErrors: boolean }): Promise<void>
}

export interface ActivateOptions {
  /** Test seam; defaults to the real dynamic import of mermaid. */
  loadMermaid?: () => Promise<{ default: MermaidModule }>
  /** Called before every DOM write; stale runs abort here. */
  isCurrent?: () => boolean
}

// Original escaped source per node, captured on first activation. Survives
// theme re-renders (which replace the node content with an SVG) and error
// boxes, without round-tripping the source through data attributes.
const sources = new WeakMap<HTMLElement, string>()

export async function activateMermaidBlocks(
  root: HTMLElement,
  theme: 'dark' | 'light',
  options: ActivateOptions = {},
): Promise<void> {
  const { isCurrent = () => true } = options
  const loadMermaid =
    options.loadMermaid ?? (() => import('mermaid') as Promise<{ default: MermaidModule }>)

  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
  if (nodes.length === 0) return

  let mermaid: MermaidModule
  try {
    mermaid = (await loadMermaid()).default
  } catch (error) {
    console.warn('[mermaid] failed to load:', error)
    if (isCurrent()) showErrorBoxes(nodes)
    return
  }
  if (!isCurrent()) return

  // Restore the original source (theme re-renders have replaced it with an
  // SVG) and clear the processed marker so mermaid will draw the node again.
  for (const node of nodes) {
    const known = sources.get(node)
    if (known === undefined) {
      sources.set(node, node.innerHTML)
    } else if (known !== node.innerHTML) {
      node.innerHTML = known
    }
    node.removeAttribute('data-processed')
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
  })

  // run() with suppressErrors never throws; failed nodes keep their source.
  try {
    await mermaid.run({ nodes, suppressErrors: true })
  } catch (error) {
    console.warn('[mermaid] run failed:', error)
  }
  if (!isCurrent()) return

  // Any node still without an <svg> child failed to render (or was empty).
  for (const node of nodes) {
    if (!node.querySelector('svg')) showErrorBox(node)
  }
}

function showErrorBoxes(nodes: HTMLElement[]): void {
  for (const node of nodes) showErrorBox(node)
}

function showErrorBox(node: HTMLElement): void {
  const source = sources.get(node) ?? node.textContent ?? ''
  node.innerHTML = ''
  const box = document.createElement('div')
  box.className = 'mermaid-error'
  const title = document.createElement('div')
  title.className = 'mermaid-error-title'
  title.textContent = 'Mermaid diagram failed to render'
  const pre = document.createElement('pre')
  pre.textContent = source || '(empty diagram)'
  box.append(title, pre)
  node.append(box)
}
