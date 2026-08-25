import { describe, it, expect } from 'vitest'
import { findDocumentItem } from './tree'
import type { TreeItem } from '../api-client.js'

function item(id: string, children: TreeItem[] = []): TreeItem {
  return { id, type: 'folder', name: id, parentId: null, children }
}

const doc = (id: string): TreeItem => ({ id, type: 'document', name: id, parentId: null })

describe('findDocumentItem', () => {
  it('finds a nested document', () => {
    const tree: TreeItem[] = [
      item('f1', [item('f2', [doc('d1'), doc('d2')])]),
      doc('d3'),
    ]
    expect(findDocumentItem(tree, 'd2')?.id).toBe('d2')
    expect(findDocumentItem(tree, 'd3')?.id).toBe('d3')
  })

  it('returns null for unknown ids', () => {
    const tree: TreeItem[] = [item('f1', [doc('d1')])]
    expect(findDocumentItem(tree, 'nope')).toBeNull()
    expect(findDocumentItem([], 'd1')).toBeNull()
  })

  it('does not match folders', () => {
    const tree: TreeItem[] = [item('f1', [doc('d1')])]
    expect(findDocumentItem(tree, 'f1')).toBeNull()
  })
})
