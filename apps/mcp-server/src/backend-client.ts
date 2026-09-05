/**
 * Typed HTTP client for backend REST API.
 * Each method forwards the user's apiKey so the backend handles auth + authz.
 */

const DEFAULT_BACKEND_URL = 'http://localhost:3000'

export class BackendClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = DEFAULT_BACKEND_URL,
  ) {}

  private async patch(path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    return res.json()
  }

  private async del(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: { Authorization: `ApiKey ${this.apiKey}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    // DELETE returns 204 with no body
    return res.status === 204 ? undefined : res.json()
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `ApiKey ${this.apiKey}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    return res.json()
  }

  private async post(path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    return res.json()
  }

  private async put(path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    return res.json()
  }

  // ========== Tree / Folders ==========

  async getTree() {
    const data = await this.get('/api/tree')
    // Backend returns the tree under the `tree` key; tolerate a bare array too.
    return Array.isArray(data) ? data : (data?.tree ?? [])
  }

  async createFolder(parentId: string | null, name: string) {
    return this.post('/api/folders', { parentId, name })
  }

  async renameFolder(id: string, name: string) {
    return this.patch(`/api/folders/${id}`, { name })
  }

  async deleteFolder(id: string) {
    return this.del(`/api/folders/${id}`)
  }

  async updateFolderSettings(id: string, mode: 'GIT' | 'SNAPSHOT') {
    return this.patch(`/api/folders/${id}/settings`, { mode })
  }

  async getFolderPermissions(id: string) {
    return this.get(`/api/folders/${id}/permissions`)
  }

  async setFolderPermissions(
    id: string,
    permissions: { userId: string; permission: 'VIEW' | 'EDIT' | 'ADMIN' }[],
  ) {
    return this.put(`/api/folders/${id}/permissions`, { permissions })
  }

  // ========== Documents ==========

  async moveDocument(id: string, folderId: string) {
    return this.post(`/api/documents/${id}/move`, { folderId })
  }

  async createDocument(folderId: string, title: string) {
    return this.post(`/api/folders/${folderId}/documents`, { title })
  }

  async getDocumentExport(id: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/documents/${id}/export`, {
      headers: { Authorization: `ApiKey ${this.apiKey}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw Object.assign(new Error(err.error?.message ?? `Backend ${res.status}`), {
        statusCode: res.status,
        code: err.error?.code ?? 'BACKEND_ERROR',
      })
    }
    return res.text()
  }

  async searchDocuments(query: string, folderId?: string) {
    const params = new URLSearchParams({ q: query })
    if (folderId) params.set('folderId', folderId)
    return this.get(`/api/documents/search?${params.toString()}`)
  }

  async updateDocumentContent(id: string, content: string, commit: boolean, message?: string) {
    return this.put(`/api/documents/${id}/content`, { content, commit, message })
  }

  async commitDocument(id: string, message: string) {
    return this.post(`/api/documents/${id}/commit`, { message })
  }

  async getUncommittedDiff(id: string) {
    return this.get(`/api/documents/${id}/diff`)
  }

  // ========== Revisions ==========

  async getRevisions(id: string, limit?: number) {
    const params = limit ? new URLSearchParams({ limit: String(limit) }) : undefined
    const path = params ? `/api/documents/${id}/revisions?${params.toString()}` : `/api/documents/${id}/revisions`
    return this.get(path)
  }

  async getRevisionContent(id: string, sha: string) {
    return this.get(`/api/documents/${id}/revisions/${sha}`)
  }

  async restoreRevision(id: string, sha: string) {
    return this.post(`/api/documents/${id}/revisions/${sha}/restore`)
  }
}
