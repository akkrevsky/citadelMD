import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BackendClient } from './backend-client.js'

/**
 * Flatten the folder tree into a list of { id, name, path } folders
 * and { id, title, filePath, folderId, updatedAt } documents.
 */
function flattenTree(tree: any[]): {
  folders: Array<{ id: string; name: string; path: string }>
  documents: Array<{ id: string; title: string; filePath: string; folderId: string; updatedAt: string }>
} {
  const folders: Array<{ id: string; name: string; path: string }> = []
  const documents: Array<{ id: string; title: string; filePath: string; folderId: string; updatedAt: string }> = []

  function walk(nodes: any[], parentPath: string) {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name
      folders.push({ id: node.id, name: node.name, path })
      for (const doc of node.documents ?? []) {
        documents.push({
          id: doc.id,
          title: doc.title,
          filePath: doc.filePath,
          folderId: node.id,
          updatedAt: doc.updatedAt,
        })
      }
      if (node.children) walk(node.children, path)
    }
  }

  if (Array.isArray(tree)) walk(tree, '')
  return { folders, documents }
}

export function registerTools(server: McpServer, backend: BackendClient): void {
  // ---- list_documents ----
  server.registerTool(
    'list_documents',
    {
      description: 'List all documents accessible to the user, optionally filtered by folder',
      inputSchema: z.object({
        folderId: z.string().uuid().optional().describe('Filter documents by folder ID'),
      }),
    },
    async ({ folderId }) => {
      const tree = await backend.getTree()
      const { documents, folders } = flattenTree(tree)

      const filtered = folderId ? documents.filter((d) => d.folderId === folderId) : documents

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ documents: filtered, folders }),
          },
        ],
      }
    },
  )

  // ---- get_document ----
  server.registerTool(
    'get_document',
    {
      description: 'Get the full content of a document by ID',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
      }),
    },
    async ({ id }) => {
      const content = await backend.getDocumentExport(id)
      return {
        content: [{ type: 'text' as const, text: content }],
      }
    },
  )

  // ---- search_documents ----
  server.registerTool(
    'search_documents',
    {
      description: 'Full-text search across all documents using git grep. Case-insensitive.',
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('Search query string'),
        folderId: z.string().uuid().optional().describe('Limit search to a specific folder'),
      }),
    },
    async ({ query, folderId }) => {
      const result = await backend.searchDocuments(query, folderId ?? undefined)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ---- create_document ----
  server.registerTool(
    'create_document',
    {
      description: 'Create a new document in the specified folder. Requires EDIT permission on the folder.',
      inputSchema: z.object({
        folderId: z.string().uuid().describe('Parent folder ID'),
        title: z.string().min(1).max(200).describe('Document title'),
        content: z.string().optional().describe('Initial markdown content'),
      }),
    },
    async ({ folderId, title }) => {
      // createDocument in the backend creates with initial content "# Title\n\n"
      // If content is needed, the caller should use update_document after creation
      const result = await backend.createDocument(folderId, title)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ---- update_document ----
  server.registerTool(
    'update_document',
    {
      description:
        'Overwrite the entire content of a document. Fails with 409 if a Yjs editing session is active. Optionally commits the change.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
        content: z.string().describe('New full markdown content'),
        commit: z.boolean().optional().describe('Whether to create a git commit (default false)'),
        message: z.string().max(500).optional().describe('Commit message (required if commit=true)'),
      }),
    },
    async ({ id, content, commit, message }) => {
      const result = await backend.updateDocumentContent(id, content, commit ?? false, message ?? undefined)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ updated: true, ...result }),
          },
        ],
      }
    },
  )

  // ---- commit_document ----
  server.registerTool(
    'commit_document',
    {
      description: 'Commit working tree changes as a new revision. Requires EDIT permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
        message: z.string().min(1).max(500).describe('Commit message'),
      }),
    },
    async ({ id, message }) => {
      const result = await backend.commitDocument(id, message)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      }
    },
  )

  // ---- list_revisions ----
  server.registerTool(
    'list_revisions',
    {
      description: 'List git revision history for a document. Requires VIEW permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
        limit: z.number().int().min(1).max(100).optional().describe('Max number of revisions (default all)'),
      }),
    },
    async ({ id, limit }) => {
      const result = await backend.getRevisions(id, limit)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ---- get_diff ----
  server.registerTool(
    'get_diff',
    {
      description: 'Get uncommitted changes diff for a document (working tree vs HEAD).',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
      }),
    },
    async ({ id }) => {
      const result = await backend.getUncommittedDiff(id)
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
      }
    },
  )

  // ---- restore_revision ----
  server.registerTool(
    'restore_revision',
    {
      description:
        'Restore a document to a previous revision. Creates a new commit recording the restoration. Requires EDIT permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
        sha: z.string().min(7).max(40).describe('Git SHA to restore to'),
      }),
    },
    async ({ id, sha }) => {
      const result = await backend.restoreRevision(id, sha)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      }
    },
  )

  // ---- list_folders ----
  server.registerTool(
    'list_folders',
    {
      description: 'List the folder tree with document counts. Requires authentication.',
      inputSchema: z.object({}).optional(),
    },
    async () => {
      const tree = await backend.getTree()
      const { folders, documents } = flattenTree(tree)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ folders, documents }),
          },
        ],
      }
    },
  )

  // ---- create_folder ----
  server.registerTool(
    'create_folder',
    {
      description:
        'Create a new folder. Without parentId it is created in your personal root. Requires EDIT permission on the parent folder.',
      inputSchema: z.object({
        parentId: z.string().uuid().optional().describe('Parent folder ID (omit for personal root)'),
        name: z.string().min(1).max(200).describe('Folder name'),
      }),
    },
    async ({ parentId, name }) => {
      const folder = await backend.createFolder(parentId ?? null, name)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(folder, null, 2) }],
      }
    },
  )

  // ---- rename_folder ----
  server.registerTool(
    'rename_folder',
    {
      description:
        'Rename a folder (git mv + commit). Personal root folders cannot be renamed. Requires EDIT permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Folder ID'),
        name: z.string().min(1).max(200).describe('New folder name'),
      }),
    },
    async ({ id, name }) => {
      const folder = await backend.renameFolder(id, name)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(folder, null, 2) }],
      }
    },
  )

  // ---- delete_folder ----
  server.registerTool(
    'delete_folder',
    {
      description:
        'Delete a folder and all its contents recursively (git rm -r + commit). Personal root folders cannot be deleted. Requires ADMIN permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Folder ID'),
      }),
    },
    async ({ id }) => {
      await backend.deleteFolder(id)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true }) }],
      }
    },
  )

  // ---- set_folder_mode ----
  server.registerTool(
    'set_folder_mode',
    {
      description:
        'Change a folder versioning mode: GIT (every save is a git revision) or SNAPSHOT (git is never touched). Requires ADMIN permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Folder ID'),
        mode: z.enum(['GIT', 'SNAPSHOT']).describe('Versioning mode'),
      }),
    },
    async ({ id, mode }) => {
      const folder = await backend.updateFolderSettings(id, mode)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(folder, null, 2) }],
      }
    },
  )

  // ---- list_folder_permissions ----
  server.registerTool(
    'list_folder_permissions',
    {
      description: 'List explicit permissions on a folder. Requires ADMIN permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Folder ID'),
      }),
    },
    async ({ id }) => {
      const result = await backend.getFolderPermissions(id)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ---- set_folder_permissions ----
  server.registerTool(
    'set_folder_permissions',
    {
      description:
        'Replace the permission list on a folder (the new list is used as-is). Each entry needs a userId and one of VIEW, EDIT, ADMIN. Requires ADMIN permission.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Folder ID'),
        permissions: z
          .array(
            z.object({
              userId: z.string().uuid().describe('User ID'),
              permission: z.enum(['VIEW', 'EDIT', 'ADMIN']).describe('Permission level'),
            }),
          )
          .describe('Full replacement permission list'),
      }),
    },
    async ({ id, permissions }) => {
      const result = await backend.setFolderPermissions(id, permissions)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ---- move_document ----
  server.registerTool(
    'move_document',
    {
      description:
        'Move a document to another folder. Requires EDIT permission on both the source and target folders.',
      inputSchema: z.object({
        id: z.string().uuid().describe('Document ID'),
        folderId: z.string().uuid().describe('Target folder ID'),
      }),
    },
    async ({ id, folderId }) => {
      const result = await backend.moveDocument(id, folderId)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )
}
