import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BackendClient } from './backend-client.js'

export function registerResources(server: McpServer, backend: BackendClient): void {
  // Document content resource: md-collab://documents/{id}
  server.resource(
    'document-content',
    new ResourceTemplate('md-collab://documents/{id}', { list: undefined }),
    async (uri, variables) => {
      const id = String(variables.id)
      const content = await backend.getDocumentExport(id)
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown' as const,
            text: content,
          },
        ],
      }
    },
  )

  // Document revisions resource: md-collab://documents/{id}/revisions
  server.resource(
    'document-revisions',
    new ResourceTemplate('md-collab://documents/{id}/revisions', { list: undefined }),
    async (uri, variables) => {
      const id = String(variables.id)
      const result = await backend.getRevisions(id)
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    },
  )

  // Folder tree resource: md-collab://folders/{id}/tree
  server.resource(
    'folder-tree',
    new ResourceTemplate('md-collab://folders/{id}/tree', { list: undefined }),
    async (uri, variables) => {
      const id = String(variables.id)
      const tree = await backend.getTree()

      function findFolder(nodes: any[], folderId: string): any | null {
        for (const node of nodes) {
          if (node.id === folderId) return node
          if (node.children) {
            const found = findFolder(node.children, folderId)
            if (found) return found
          }
        }
        return null
      }

      const folder = Array.isArray(tree) ? findFolder(tree, id) : null

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json' as const,
            text: JSON.stringify(folder ?? { error: 'Folder not found' }, null, 2),
          },
        ],
      }
    },
  )
}
