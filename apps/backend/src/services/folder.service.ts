import path from 'node:path'
import fs from 'node:fs/promises'
import { GitService, type FolderPermissionLevel } from '@citadelmd/shared'
import { prisma } from '../prisma.js'

// ========== Types ==========

export interface CreateFolderInput {
  parentId: string | null
  name: string
  createdById: string
}

export interface UpdateFolderInput {
  name: string
}

export interface FolderTreeNode {
  id: string
  name: string
  permission: FolderPermissionLevel
  children: FolderTreeNode[]
  documents: {
    id: string
    title: string
    filePath: string
    updatedAt: Date
  }[]
}

export interface FolderPermissionEntry {
  userId: string
  login: string
  permission: FolderPermissionLevel
}

// ========== Constants ==========

const PERMISSION_ORDER: Record<FolderPermissionLevel, number> = {
  VIEW: 0,
  EDIT: 1,
  ADMIN: 2,
}

function maxPermission(a: FolderPermissionLevel, b: FolderPermissionLevel): FolderPermissionLevel {
  return PERMISSION_ORDER[a] >= PERMISSION_ORDER[b] ? a : b
}

// ========== Helpers ==========

function getGitRepoPath(): string {
  const repoPath = process.env.GIT_REPO_PATH
  if (!repoPath) throw new Error('GIT_REPO_PATH env var is required')
  return repoPath
}

async function resolveGitPath(parentId: string | null, name: string): Promise<string> {
  if (!parentId) return name

  const parent = await prisma.folder.findUnique({
    where: { id: parentId },
    select: { gitPath: true },
  })
  if (!parent) {
    throw Object.assign(new Error('Parent folder not found'), { statusCode: 404 })
  }
  return `${parent.gitPath}/${name}`
}

/**
 * Compute effective permission for a user on a given folder.
 * Algorithm: walk folder path root-to-node, gather all explicit permissions,
 * take the max permission value found.
 * Admins bypass folder-level permissions.
 */
export async function getEffectivePermission(
  userId: string,
  folderId: string,
): Promise<FolderPermissionLevel> {
  // Gather all folder IDs from this node up to root
  const folderIds = await collectFolderAncestors(folderId)

  // Fetch all permissions for this user on any folder in the path
  const permissions = await prisma.folderPermission.findMany({
    where: {
      folderId: { in: folderIds },
      userId,
    },
    select: { permission: true },
  })

  if (permissions.length === 0) return 'VIEW' // default read

  return permissions
    .map((p: { permission: string }) => p.permission as FolderPermissionLevel)
    .reduce((acc: FolderPermissionLevel, p: FolderPermissionLevel) => maxPermission(acc, p), 'VIEW' as FolderPermissionLevel)
}

async function collectFolderAncestors(folderId: string): Promise<string[]> {
  const ids: string[] = []
  let nodeId: string | null = folderId

  while (nodeId !== null) {
    ids.push(nodeId)
    const node: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: nodeId },
      select: { parentId: true },
    })
    if (!node) break
    nodeId = node.parentId
  }

  return ids
}

/**
 * Compute effective permission without DB lookups (for batch building).
 * Walks the in-memory folder ancestry to find the highest permission.
 */
export function computeEffectivePermissionFromAncestors(
  folderId: string,
  folderMap: Map<string, { id: string; parentId: string | null; name: string }>,
  permissionMap: Map<string, FolderPermissionLevel>,
): FolderPermissionLevel {
  const currentPath: string[] = []
  let currentId: string | null = folderId
  while (currentId) {
    currentPath.push(currentId)
    const f = folderMap.get(currentId)
    if (!f) break
    currentId = f.parentId
  }

  let effective: FolderPermissionLevel = 'VIEW'
  for (const fid of currentPath) {
    const p = permissionMap.get(fid)
    if (p) {
      effective = maxPermission(effective, p)
    }
  }
  return effective
}

// ========== Core CRUD ==========

interface FolderRow {
  id: string
  parentId: string | null
  name: string
  gitPath: string
  createdAt: Date
  createdById: string | null
}

interface DocumentRow {
  id: string
  folderId: string
  title: string
  filePath: string
  createdAt: Date
  updatedAt: Date
  createdById: string | null
}

interface UserRow {
  id: string
  login: string
  gitName: string | null
  gitEmail: string | null
}

export async function createFolder(input: CreateFolderInput) {
  const { parentId, name, createdById } = input

  // Validate parent exists
  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } })
    if (!parent) {
      throw Object.assign(new Error('Parent folder not found'), { statusCode: 404 })
    }
  }

  // Check duplicate name under same parent
  const existing = await prisma.folder.findFirst({
    where: { parentId: parentId ?? null, name },
  })
  if (existing) {
    throw Object.assign(new Error('Folder with this name already exists in the parent'), {
      statusCode: 409,
    })
  }

  const gitPath = await resolveGitPath(parentId, name)
  const repoPath = getGitRepoPath()

  // Create git directory
  const gitDir = path.join(repoPath, gitPath)
  await fs.mkdir(gitDir, { recursive: true })

  // Create .gitkeep so the empty folder is tracked by git
  await fs.writeFile(path.join(gitDir, '.gitkeep'), '')

  // Git commit
  const createdBy = await prisma.user.findUnique({
    where: { id: createdById },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = createdBy?.gitName ?? createdBy?.login ?? 'Unknown'
  const authorEmail = createdBy?.gitEmail ?? `${createdBy?.login ?? 'unknown'}@mdcollab.local`

  const git = new GitService(repoPath)
  await git.commit(
    `${gitPath}/.gitkeep`,
    `Create folder ${name} [user:${createdBy?.login ?? 'unknown'}]`,
    { name: authorName, email: authorEmail },
  )

  // Create in DB
  const folder = await prisma.folder.create({
    data: {
      parentId: parentId ?? null,
      name,
      gitPath,
      createdById,
    },
  })

  return folder
}

export async function renameFolder(folderId: string, input: UpdateFolderInput, userId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  const { name: newName } = input
  const oldGitPath = folder.gitPath
  const parentId = folder.parentId
  const parent = parentId
    ? await prisma.folder.findUnique({ where: { id: parentId } })
    : null
  const newGitPath = parent
    ? `${parent.gitPath}/${newName}`
    : newName

  // Check for duplicate name under same parent
  const duplicate = await prisma.folder.findFirst({
    where: { parentId, name: newName, id: { not: folderId } },
  })
  if (duplicate) {
    throw Object.assign(new Error('Folder with this name already exists in the parent'), {
      statusCode: 409,
    })
  }

  const repoPath = getGitRepoPath()
  const git = new GitService(repoPath)

  // git mv old -> new
  await git.rename(oldGitPath, newGitPath)

  // Commit
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = user?.gitName ?? user?.login ?? 'Unknown'
  const authorEmail = user?.gitEmail ?? `${user?.login ?? 'unknown'}@mdcollab.local`

  await git.commit(
    newGitPath,
    `Rename folder ${folder.name} -> ${newName} [user:${user?.login ?? 'unknown'}]`,
    { name: authorName, email: authorEmail },
  )

  // Update DB: folder name and gitPath
  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: {
      name: newName,
      gitPath: newGitPath,
    },
  })

  // Update all descendant folders' git_paths
  await updateDescendantGitPaths(oldGitPath, newGitPath)

  return updated
}

async function updateDescendantGitPaths(oldPrefix: string, newPrefix: string) {
  const descendants = await prisma.folder.findMany({
    where: {
      gitPath: { startsWith: `${oldPrefix}/` },
    },
  })

  for (const desc of descendants) {
    const newDescGitPath = desc.gitPath.replace(oldPrefix, newPrefix)
    await prisma.folder.update({
      where: { id: desc.id },
      data: { gitPath: newDescGitPath },
    })
  }

  // Also update documents in these folders
  const docs = await prisma.document.findMany({
    where: {
      filePath: { startsWith: `${oldPrefix}/` },
    },
  })

  for (const doc of docs) {
    const newFilePath = doc.filePath.replace(oldPrefix, newPrefix)
    await prisma.document.update({
      where: { id: doc.id },
      data: { filePath: newFilePath },
    })
  }
}

export async function deleteFolder(folderId: string, userId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  const repoPath = getGitRepoPath()
  const git = new GitService(repoPath)

  // Get all descendant folder git paths
  const descendantFolders = await prisma.folder.findMany({
    where: {
      OR: [
        { id: folderId },
        { gitPath: { startsWith: `${folder.gitPath}/` } },
      ],
    },
  })

  const descendantFolderIds = descendantFolders.map((f: FolderRow) => f.id)

  // Get all documents in these folders
  const documents = await prisma.document.findMany({
    where: { folderId: { in: descendantFolderIds } },
  })

  // Git rm -r (recursive)
  await git.remove(folder.gitPath)

  // Commit
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = user?.gitName ?? user?.login ?? 'Unknown'
  const authorEmail = user?.gitEmail ?? `${user?.login ?? 'unknown'}@mdcollab.local`

  await git.commit(
    folder.gitPath,
    `Delete folder ${folder.name} [user:${user?.login ?? 'unknown'}]`,
    { name: authorName, email: authorEmail },
  )

  // Delete from DB (cascade handled by Prisma)
  if (documents.length > 0) {
    await prisma.document.deleteMany({
      where: { folderId: { in: descendantFolderIds } },
    })
  }
  await prisma.folderPermission.deleteMany({
    where: { folderId: { in: descendantFolderIds } },
  })
  await prisma.folder.deleteMany({
    where: { id: { in: descendantFolderIds } },
  })
}

// ========== Tree ==========

export async function getTree(userId: string, userRole: string): Promise<{ tree: FolderTreeNode[] }> {
  // Admin sees everything
  if (userRole === 'ADMIN') {
    return buildFullTree()
  }

  // Non-admin: build tree filtered by effective permissions
  return buildFilteredTree(userId)
}

async function buildFullTree(): Promise<{ tree: FolderTreeNode[] }> {
  const allFolders = await prisma.folder.findMany({ orderBy: { name: 'asc' } })
  const allDocs = await prisma.document.findMany({ orderBy: { title: 'asc' } })

  const docsByFolder = new Map<string, DocumentRow[]>()
  for (const d of allDocs) {
    const arr = docsByFolder.get(d.folderId) ?? []
    arr.push(d)
    docsByFolder.set(d.folderId, arr)
  }

  function buildNode(f: FolderRow): FolderTreeNode {
    const children = allFolders
      .filter((child: FolderRow) => child.parentId === f.id)
      .map(buildNode)

    const documents = (docsByFolder.get(f.id) ?? []).map((d: DocumentRow) => ({
      id: d.id,
      title: d.title,
      filePath: d.filePath,
      updatedAt: d.updatedAt,
    }))

    return {
      id: f.id,
      name: f.name,
      permission: 'ADMIN' as FolderPermissionLevel,
      children,
      documents,
    }
  }

  const tree = allFolders.filter((f: FolderRow) => f.parentId === null).map(buildNode)
  return { tree }
}

async function buildFilteredTree(userId: string): Promise<{ tree: FolderTreeNode[] }> {
  const allFolders = await prisma.folder.findMany({ orderBy: { name: 'asc' } })
  const allDocs = await prisma.document.findMany({ orderBy: { title: 'asc' } })
  const allPermissions = await prisma.folderPermission.findMany({
    where: { userId },
  })

  // Build lookup maps
  const folderMap = new Map<string, FolderRow>()
  for (const f of allFolders) folderMap.set(f.id, f)

  const permissionMap = new Map<string, FolderPermissionLevel>()
  for (const p of allPermissions) {
    permissionMap.set(p.folderId, p.permission as FolderPermissionLevel)
  }

  const orgDocsByFolder = new Map<string, DocumentRow[]>()
  for (const d of allDocs) {
    const arr = orgDocsByFolder.get(d.folderId) ?? []
    arr.push(d)
    orgDocsByFolder.set(d.folderId, arr)
  }

  // Build effective permission for each folder
  const effectivePermissions = new Map<string, FolderPermissionLevel>()
  for (const f of allFolders) {
    effectivePermissions.set(
      f.id,
      computeEffectivePermissionFromAncestors(f.id, folderMap, permissionMap),
    )
  }

  // Only include folders where user has view+ access
  const accessibleFolderIds = new Set(
    [...effectivePermissions.entries()]
      .filter(([, perm]) => PERMISSION_ORDER[perm] >= PERMISSION_ORDER.VIEW)
      .map(([id]) => id),
  )

  function buildNode(f: FolderRow): FolderTreeNode | null {
    if (!accessibleFolderIds.has(f.id)) return null

    const children: FolderTreeNode[] = []
    for (const child of allFolders) {
      if (child.parentId !== f.id) continue
      const node = buildNode(child)
      if (node !== null) children.push(node)
    }

    const documents = (orgDocsByFolder.get(f.id) ?? []).map((d: DocumentRow) => ({
      id: d.id,
      title: d.title,
      filePath: d.filePath,
      updatedAt: d.updatedAt,
    }))

    const permission = effectivePermissions.get(f.id) ?? 'VIEW'

    // Only include folders that have either accessible children or documents
    if (children.length === 0 && documents.length === 0) return null

    return {
      id: f.id,
      name: f.name,
      permission,
      children,
      documents,
    }
  }

  const tree: FolderTreeNode[] = []
  for (const f of allFolders) {
    if (f.parentId !== null) continue
    const node = buildNode(f)
    if (node !== null) tree.push(node)
  }

  return { tree }
}

// ========== Permissions Management ==========

export async function getFolderPermissions(folderId: string): Promise<FolderPermissionEntry[]> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  const perms = await prisma.folderPermission.findMany({
    where: { folderId },
    include: {
      user: { select: { login: true } },
    },
  })

  return perms.map((p: { userId: string; user: { login: string | null }; permission: string }) => ({
    userId: p.userId,
    login: p.user.login ?? 'unknown',
    permission: p.permission as FolderPermissionLevel,
  }))
}

export async function setFolderPermissions(
  folderId: string,
  permissions: { userId: string; permission: FolderPermissionLevel }[],
): Promise<FolderPermissionEntry[]> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  // Validate all users exist
  const userIds = permissions.map((p: { userId: string; permission: FolderPermissionLevel }) => p.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, login: true },
  })
  const userMap = new Map<string, string>(users.map((u: { id: string; login: string | null }) => [u.id, u.login ?? 'unknown']))

  for (const uid of userIds) {
    if (!userMap.has(uid)) {
      throw Object.assign(new Error(`User ${uid} not found`), { statusCode: 404 })
    }
  }

  // Replace all permissions for this folder
  await prisma.folderPermission.deleteMany({ where: { folderId } })

  if (permissions.length > 0) {
    await prisma.folderPermission.createMany({
      data: permissions.map((p: { userId: string; permission: FolderPermissionLevel }) => ({
        folderId,
        userId: p.userId,
        permission: p.permission,
      })),
    })
  }

  // Return updated permissions
  return permissions.map((p: { userId: string; permission: FolderPermissionLevel }) => ({
    userId: p.userId,
    login: userMap.get(p.userId) ?? 'unknown',
    permission: p.permission,
  }))
}
