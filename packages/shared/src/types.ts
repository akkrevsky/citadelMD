export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type FolderPermissionLevel = 'VIEW' | 'EDIT' | 'ADMIN'

export type SharePermission = 'READ' | 'WRITE'

export interface User {
  id: string
  login: string
  role: UserRole
  displayName: string | null
  gitName: string | null
  gitEmail: string | null
  apiKey: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Folder {
  id: string
  parentId: string | null
  name: string
  gitPath: string
  createdAt: Date
  createdById: string | null
}

export interface Document {
  id: string
  folderId: string
  title: string
  filePath: string
  createdAt: Date
  updatedAt: Date
  createdById: string | null
}

export interface ApiError {
  error: { code: string; message: string }
}
