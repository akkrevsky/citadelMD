import type { TreeItem } from '../api-client'

export function findFirstDocument(items: TreeItem[]): string | null {
  for (const item of items) {
    if (item.type === 'document') return item.id
    if (item.children) {
      const found = findFirstDocument(item.children)
      if (found) return found
    }
  }
  return null
}

export function findFirstFolder(items: TreeItem[]): string | null {
  for (const item of items) {
    if (item.type === 'folder') return item.id
    if (item.children) {
      const found = findFirstFolder(item.children)
      if (found) return found
    }
  }
  return null
}

export function collectDocumentIds(items: TreeItem[]): Set<string> {
  const ids = new Set<string>()
  function walk(nodes: TreeItem[]) {
    for (const item of nodes) {
      if (item.type === 'document') ids.add(item.id)
      if (item.children) walk(item.children)
    }
  }
  walk(items)
  return ids
}

/** All document ids inside a folder's subtree (for closing tabs on folder delete) */
export function collectSubtreeDocumentIds(items: TreeItem[], folderId: string): Set<string> {
  function find(nodes: TreeItem[]): TreeItem | null {
    for (const node of nodes) {
      if (node.type === 'folder' && node.id === folderId) return node
      if (node.children) {
        const found = find(node.children)
        if (found) return found
      }
    }
    return null
  }

  const folder = find(items)
  if (!folder?.children) return new Set()
  return collectDocumentIds(folder.children)
}
