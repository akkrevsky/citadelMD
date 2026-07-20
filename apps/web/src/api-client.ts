export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface ApiError {
  error: { code: string; message: string }
}

export interface CurrentUser {
  id: string
  login: string
  role: UserRole
  displayName: string | null
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
  children?: TreeItem[]
}

export interface Document {
  id: string
  title: string
  filePath: string
  updatedAt: string
}

class ApiClient {
  private baseUrl = '/api'

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
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

  // Users (admin)
  listUsers() {
    return this.request<UserRecord[]>('/users')
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
      const res = await this.request<{ tree: TreeItem[] }>('/tree')
      return Array.isArray(res.tree) ? res.tree : []
    } catch {
      return []
    }
  }

  // Documents
  getDocument(id: string) {
    return this.request<Document>(`/documents/${id}`)
  }

  exportDocument(id: string) {
    return this.request<string>(`/documents/${id}/export`)
  }

  commitDocument(id: string, message: string) {
    return this.request<void>(`/documents/${id}/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  discardDocument(id: string) {
    return this.request<void>(`/documents/${id}/discard`, {
      method: 'POST',
    })
  }
}

export const api = new ApiClient()
