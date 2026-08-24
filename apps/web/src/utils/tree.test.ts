import { describe, it, expect } from 'vitest'
import type { TreeItem } from '../api-client'
import { collectSubtreeDocumentIds } from './tree'

function item(partial: Partial<TreeItem>): TreeItem {
  return { id: 'x', name: 'x', type: 'document', ...partial }
}

describe('collectSubtreeDocumentIds', () => {
  it('collects documents from a folder subtree', () => {
    const tree: TreeItem[] = [
      item({
        id: 'f1',
        name: 'Root',
        type: 'folder',
        children: [
          item({ id: 'd1', name: 'doc1', type: 'document' }),
          item({
            id: 'f2',
            name: 'Sub',
            type: 'folder',
            children: [
              item({ id: 'd2', name: 'doc2', type: 'document' }),
              item({
                id: 'f3',
                name: 'Deep',
                type: 'folder',
                children: [item({ id: 'd3', name: 'doc3', type: 'document' })],
              }),
            ],
          }),
        ],
      }),
      item({ id: 'f4', name: 'Other', type: 'folder', children: [item({ id: 'd4', name: 'doc4', type: 'document' })] }),
    ]

    expect(collectSubtreeDocumentIds(tree, 'f2')).toEqual(new Set(['d2', 'd3']))
    expect(collectSubtreeDocumentIds(tree, 'f1')).toEqual(new Set(['d1', 'd2', 'd3']))
    expect(collectSubtreeDocumentIds(tree, 'f4')).toEqual(new Set(['d4']))
  })

  it('returns an empty set for an unknown folder', () => {
    expect(collectSubtreeDocumentIds([], 'missing')).toEqual(new Set())
  })
})
