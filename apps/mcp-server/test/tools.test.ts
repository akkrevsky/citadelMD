/**
 * MCP server tests — auth, backend-client, and tool registration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---- auth tests ----
import { resolveApiKey } from '../src/auth.js'

describe('resolveApiKey', () => {
  it('returns user when backend responds ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          user: { id: 'user-1', login: 'admin', role: 'ADMIN' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const user = await resolveApiKey('test-key', 'http://localhost:3000')
    expect(user).toEqual({ id: 'user-1', login: 'admin', role: 'ADMIN' })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'ApiKey test-key' },
    })
  })

  it('returns null when backend rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const user = await resolveApiKey('bad-key', 'http://localhost:3000')
    expect(user).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const user = await resolveApiKey('key', 'http://localhost:3000')
    expect(user).toBeNull()
  })
})

// ---- backend-client tests ----
import { BackendClient } from '../src/backend-client.js'

describe('BackendClient', () => {
  let client: BackendClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    client = new BackendClient('test-api-key', 'http://localhost:3000')
  })

  it('calls getTree with apiKey auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tree: [{ id: 'root', name: 'Docs' }] }),
    })

    const result = await client.getTree()
    expect(result).toEqual([{ id: 'root', name: 'Docs' }])
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/tree', {
      headers: { Authorization: 'ApiKey test-api-key' },
    })
  })

  it('getDocumentExport returns raw text', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Hello'),
    })

    const content = await client.getDocumentExport('doc-1')
    expect(content).toBe('# Hello')
  })

  it('getDocumentExport throws on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Not found' } }),
    })

    await expect(client.getDocumentExport('doc-missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('createDocument sends POST with title', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'doc-1', title: 'New Doc' }),
    })

    const result = await client.createDocument('folder-1', 'New Doc')
    expect(result).toEqual({ id: 'doc-1', title: 'New Doc' })

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders/folder-1/documents')
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual({ title: 'New Doc' })
  })

  it('searchDocuments includes folderId in query params', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    })

    await client.searchDocuments('hello', 'folder-1')

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/documents/search?')
    expect(url).toContain('q=hello')
    expect(url).toContain('folderId=folder-1')
  })

  it('updateDocumentContent sends PUT with content and optional commit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sha: 'abc' }),
    })

    const result = await client.updateDocumentContent('doc-1', '# New', true, 'Update')
    expect(result).toEqual({ sha: 'abc' })

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/documents/doc-1/content')
    expect(callArgs[1].method).toBe('PUT')
    expect(JSON.parse(callArgs[1].body)).toEqual({
      content: '# New',
      commit: true,
      message: 'Update',
    })
  })

  it('commitDocument sends POST with message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Committed' }),
    })

    await client.commitDocument('doc-1', 'My commit')

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/documents/doc-1/commit')
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual({ message: 'My commit' })
  })

  it('getRevisions sends GET with optional limit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ revisions: [] }),
    })

    await client.getRevisions('doc-1', 10)
    expect(mockFetch.mock.calls[0][0]).toContain('limit=10')
  })

  it('restoreRevision sends POST', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Restored' }),
    })

    await client.restoreRevision('doc-1', 'abc123def')

    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:3000/api/documents/doc-1/revisions/abc123def/restore',
    )
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  // ---- folder / move methods ----

  it('createFolder sends POST with parentId and name', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'folder-2', name: 'Notes' }),
    })

    const result = await client.createFolder('folder-1', 'Notes')
    expect(result).toEqual({ id: 'folder-2', name: 'Notes' })

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders')
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual({ parentId: 'folder-1', name: 'Notes' })
  })

  it('renameFolder sends PATCH', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'folder-1', name: 'Renamed' }),
    })

    await client.renameFolder('folder-1', 'Renamed')

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders/folder-1')
    expect(callArgs[1].method).toBe('PATCH')
    expect(JSON.parse(callArgs[1].body)).toEqual({ name: 'Renamed' })
  })

  it('deleteFolder sends DELETE and tolerates 204 without body', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(null) })

    const result = await client.deleteFolder('folder-1')
    expect(result).toBeUndefined()

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders/folder-1')
    expect(callArgs[1].method).toBe('DELETE')
  })

  it('deleteFolder throws on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'FOLDER_NOT_FOUND', message: 'Not found' } }),
    })

    await expect(client.deleteFolder('folder-missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('updateFolderSettings sends PATCH with mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'folder-1', mode: 'SNAPSHOT' }),
    })

    await client.updateFolderSettings('folder-1', 'SNAPSHOT')

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders/folder-1/settings')
    expect(callArgs[1].method).toBe('PATCH')
    expect(JSON.parse(callArgs[1].body)).toEqual({ mode: 'SNAPSHOT' })
  })

  it('getFolderPermissions sends GET', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ permissions: [] }),
    })

    const result = await client.getFolderPermissions('folder-1')
    expect(result).toEqual({ permissions: [] })
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/api/folders/folder-1/permissions')
  })

  it('setFolderPermissions sends PUT with permissions array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ permissions: [{ userId: 'user-1', permission: 'EDIT' }] }),
    })

    await client.setFolderPermissions('folder-1', [{ userId: 'user-1', permission: 'EDIT' }])

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/folders/folder-1/permissions')
    expect(callArgs[1].method).toBe('PUT')
    expect(JSON.parse(callArgs[1].body)).toEqual({
      permissions: [{ userId: 'user-1', permission: 'EDIT' }],
    })
  })

  it('moveDocument sends POST with folderId', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'doc-1', folderId: 'folder-2' }),
    })

    await client.moveDocument('doc-1', 'folder-2')

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('http://localhost:3000/api/documents/doc-1/move')
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual({ folderId: 'folder-2' })
  })
})

// ---- tools registration test ----
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools } from '../src/tools.js'
import { buildDescription } from '../src/describe.js'

describe('registerTools', () => {
  it('registers all tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const backend = new BackendClient('test-key', 'http://localhost:3000')

    // Should not throw
    registerTools(server, backend)

    const description = buildDescription(server, 'http://localhost:3100')
    const names = (description.tools as { name: string }[]).map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_documents',
        'get_document',
        'search_documents',
        'create_document',
        'update_document',
        'commit_document',
        'list_revisions',
        'get_diff',
        'restore_revision',
        'list_folders',
        'create_folder',
        'rename_folder',
        'delete_folder',
        'set_folder_mode',
        'list_folder_permissions',
        'set_folder_permissions',
        'move_document',
      ]),
    )
    expect(names).toHaveLength(17)
  })
})
