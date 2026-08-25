export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface ApiError {
  error: { code: string; message: string }
}

export interface CurrentUser {
  id: string
  login: string
  role: UserRole
  displayName: string | null
  gitName: string | null
  gitEmail: string | null
}

export interface FolderPermissionEntry {
  userId: string
  login: string
  permission: 'VIEW' | 'EDIT' | 'ADMIN'
}

export interface UserRecord {
  id: string
  login: string
  role: UserRole
  displayName: string | null
  gitName: string | null
  gitEmail: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface TreeItem {
  id: string
  name: string
  type: 'folder' | 'document'
  kind?: 'MARKDOWN' | 'EXCALIDRAW'
  createdAt?: string
  updatedAt?: string
  filePath?: string
  folderMode?: 'GIT' | 'SNAPSHOT'
  /** Folders: own parent id (null for top-level); documents: their parent folder id */
  parentId?: string | null
  /** Folders only: git path ('' for the legacy Root folder) */
  folderGitPath?: string
  /** Folders only: effective permission of the current user (VIEW/EDIT/ADMIN) */
  permission?: string
  /** Folders only: owner user id (set on personal roots) */
  ownerId?: string | null
  children?: TreeItem[]
}

export interface FolderNode {
  id: string
  name: string
  mode?: 'GIT' | 'SNAPSHOT'
  parentId: string | null
  gitPath: string
  permission: string
  ownerId?: string | null
  children: FolderNode[]
  documents: Document[]
}

export interface Document {
  id: string
  title: string
  kind?: 'MARKDOWN' | 'EXCALIDRAW'
  filePath: string
  createdAt: string
  updatedAt: string
  hasUncommittedChanges?: boolean
  folderMode?: 'GIT' | 'SNAPSHOT'
  folderId?: string
}

export interface UploadItem {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  documentId: string
  documentTitle: string
  documentPath: string
  url: string
  createdAt: string
}

/** Convert FolderNode[] + documents to nested TreeItem[] */
function flattenTree(folders: FolderNode[]): TreeItem[] {
  const result: TreeItem[] = []
  for (const folder of folders) {
    const children: TreeItem[] = flattenTree(folder.children)
    for (const doc of folder.documents) {
      children.push({
        id: doc.id,
        name: doc.title,
        type: 'document',
        kind: doc.kind ?? 'MARKDOWN',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        filePath: doc.filePath,
        folderMode: folder.mode ?? 'GIT',
        parentId: folder.id,
      })
    }
    result.push({
      id: folder.id,
      name: folder.name,
      type: 'folder',
      folderMode: folder.mode ?? 'GIT',
      parentId: folder.parentId,
      folderGitPath: folder.gitPath,
      permission: folder.permission,
      ownerId: folder.ownerId ?? null,
      children,
    })
  }
  return result
}

class ApiClient {
  private baseUrl = '/api'

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Only set Content-Type: application/json when there is a body. Sending
    // the header with an empty body makes Fastify reject the request with
    // 400 "Body cannot be empty when content-type is set to 'application/json'".
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    }
    if (
      options.body !== undefined &&
      options.body !== null &&
      !(options.body instanceof FormData)
    ) {
      headers['Content-Type'] = 'application/json'
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'same-origin',
      headers,
      ...options,
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiError | null
      const message =
        body?.error?.message ?? `Request failed with status ${res.status}`
      const code = body?.error?.code ?? 'UNKNOWN'
      const err = new Error(message) as Error & {
        status: number
        code: string
      }
      err.status = res.status
      err.code = code
      throw err
    }

    if (res.status === 204) {
      return undefined as T
    }

    return res.json() as Promise<T>
  }

  private async requestText(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'same-origin',
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiError | null
      const message = body?.error?.message ?? `Request failed with status ${res.status}`
      throw new Error(message)
    }
    return res.text()
  }

  // Auth
  login(login: string, password: string) {
    return this.request<{ user: CurrentUser; expiresAt: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      },
    )
  }

  logout() {
    return this.request<void>('/auth/logout', { method: 'POST' })
  }

  getMe() {
    return this.request<{ user: CurrentUser }>('/auth/me')
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ ok: boolean }>('/auth/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  }

  updateProfile(data: { gitName?: string | null; gitEmail?: string | null; displayName?: string | null }) {
    return this.request<{ user: CurrentUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // Users (admin)
  async listUsers(): Promise<UserRecord[]> {
    const res = await this.request<{ data: UserRecord[] }>('/users')
    return Array.isArray(res.data) ? res.data : []
  }

  createUser(data: {
    login: string
    password: string
    role: UserRole
    displayName?: string
  }) {
    return this.request<UserRecord>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  deactivateUser(id: string) {
    return this.request<void>(`/users/${id}`, { method: 'DELETE' })
  }

  // Folder tree
  async getTree(): Promise<TreeItem[]> {
    try {
      const res = await this.request<{ tree: FolderNode[] }>('/tree')
      const folders = Array.isArray(res.tree) ? res.tree : []
      return flattenTree(folders)
    } catch {
      return []
    }
  }

  // Documents
  getDocument(id: string) {
    return this.request<Document>(`/documents/${id}`)
  }

  exportDocument(id: string) {
    return this.requestText(`/documents/${id}/export`)
  }

  putDocumentContent(id: string, content: string, commit = false, message?: string) {
    return this.request<{ sha?: string }>(`/documents/${id}/content`, {
      method: 'PUT',
      body: JSON.stringify({ content, commit, message }),
    })
  }

  commitDocument(id: string, message: string) {
    return this.request<{ message: string; updatedAt?: string }>(`/documents/${id}/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  discardDocument(id: string) {
    return this.request<void>(`/documents/${id}/discard`, {
      method: 'POST',
    })
  }

  getRevisions(id: string, limit?: number) {
    const params = limit ? `?limit=${limit}` : ''
    return this.request<{ revisions: any[] }>(`/documents/${id}/revisions${params}`)
  }

  getRevisionContent(id: string, sha: string) {
    return this.request<{ content: string }>(`/documents/${id}/revisions/${sha}`).then((r) => r.content)
  }

  getRevisionDiff(id: string, sha: string) {
    return this.request<{ diff: string }>(`/documents/${id}/revisions/${sha}/diff`).then((r) => r.diff)
  }

  restoreToRevision(id: string, sha: string) {
    return this.request<void>(`/documents/${id}/revisions/${sha}/restore`, {
      method: 'POST',
    })
  }

  resolveDocumentPath(path: string) {
    return this.request<{ id: string; title: string; kind?: 'MARKDOWN' | 'EXCALIDRAW' }>(
      `/documents/by-path?path=${encodeURIComponent(path)}`,
    )
  }

  getDiff(id: string) {
    return this.request<{ diff: string }>(`/documents/${id}/diff`)
  }

  updateDocument(id: string, data: { title?: string }) {
    return this.request<Document>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  deleteDocument(id: string) {
    return this.request<void>(`/documents/${id}`, {
      method: 'DELETE',
    })
  }

  moveDocument(id: string, folderId: string) {
    return this.request<Document>(`/documents/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ folderId }),
    })
  }

  // Create document in folder
  createDocument(folderId: string, title: string, kind: 'MARKDOWN' | 'EXCALIDRAW' = 'MARKDOWN') {
    return this.request<Document>(`/folders/${folderId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title, kind }),
    })
  }

  aiChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
    return this.request<{ text: string }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    })
  }

  importDocument(folderId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.request<Document>(`/folders/${folderId}/import`, {
      method: 'POST',
      body: formData,
    })
  }

  createFolder(name: string, parentId?: string | null) {
    return this.request<{ id: string; name: string; mode: 'GIT' | 'SNAPSHOT' }>('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    })
  }

  renameFolder(id: string, data: { name: string }) {
    return this.request<{ id: string; name: string; mode: 'GIT' | 'SNAPSHOT' }>(`/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  deleteFolder(id: string) {
    return this.request<void>(`/folders/${id}`, {
      method: 'DELETE',
    })
  }

  updateFolderSettings(folderId: string, data: { mode: 'GIT' | 'SNAPSHOT' }) {
    return this.request<{ id: string; name: string; mode: 'GIT' | 'SNAPSHOT' }>(
      `/folders/${folderId}/settings`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    )
  }

  getFolderPermissions(folderId: string) {
    return this.request<{ permissions: FolderPermissionEntry[] }>(
      `/folders/${folderId}/permissions`,
    ).then((r) => r.permissions ?? [])
  }

  setFolderPermissions(
    folderId: string,
    permissions: { userId: string; permission: 'VIEW' | 'EDIT' | 'ADMIN' }[],
  ) {
    return this.request<{ permissions: FolderPermissionEntry[] }>(
      `/folders/${folderId}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      },
    ).then((r) => r.permissions ?? [])
  }

  listUploads(documentId?: string) {
    const params = documentId ? `?documentId=${encodeURIComponent(documentId)}` : ''
    return this.request<{ uploads: UploadItem[] }>(`/uploads${params}`).then((r) => r.uploads ?? [])
  }
}

export const api = new ApiClient()
