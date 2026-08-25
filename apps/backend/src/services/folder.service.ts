import path from 'node:path'
import fs from 'node:fs/promises'
import { GitService, type FolderPermissionLevel } from '@citadelmd/shared'
import { prisma } from '../prisma.js'
import { withFileLock } from './lock.js'

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
  mode: 'GIT' | 'SNAPSHOT'
  parentId: string | null
  gitPath: string
  ownerId: string | null
  permission: FolderPermissionLevel
  children: FolderTreeNode[]
  documents: {
    id: string
    title: string
    kind: 'MARKDOWN' | 'EXCALIDRAW'
    filePath: string
    createdAt: Date
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
  return joinGitPath(parent.gitPath, name)
}

// The root folder has gitPath '/'; joining naively would produce '/name',
// which git rejects as an invalid path.
function joinGitPath(parentPath: string, name: string): string {
  const base = parentPath === '/' ? '' : parentPath
  return base ? `${base}/${name}` : name
}

/** Sanitize a login into a filesystem-safe directory name (mirrors sanitizeFileName) */
export function sanitizeLoginForGitPath(login: string): string {
  const cleaned = login
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'user'
}

/**
 * Provision the user's personal root folder (users/<login>) lazily.
 * Idempotent and race-safe: concurrent callers converge on the same row.
 */
export async function ensurePersonalFolder(userId: string): Promise<FolderRow> {
  const existing = await prisma.folder.findFirst({ where: { ownerId: userId } })
  if (existing) return existing

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, gitName: true, gitEmail: true },
  })
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }

  // Login is immutable, so the path is stable for the user's lifetime;
  // collisions between sanitized logins get a deterministic uuid suffix.
  const base = `users/${sanitizeLoginForGitPath(user.login)}`
  let gitPath = base
  const suffixes = [userId.slice(0, 6), userId.replace(/-/g, '').slice(0, 8)]
  for (const suffix of suffixes) {
    const collision = await prisma.folder.findFirst({ where: { gitPath } })
    if (!collision) break
    gitPath = `${base}-${suffix}`
  }
  const stillCollides = await prisma.folder.findFirst({ where: { gitPath } })
  if (stillCollides) {
    throw Object.assign(new Error('Could not allocate a personal folder path'), { statusCode: 409 })
  }

  const repoPath = getGitRepoPath()
  const authorName = user.gitName ?? user.login
  const authorEmail = user.gitEmail ?? `${user.login}@mdcollab.local`

  // Serialize the git dir creation with other filesystem writers
  await withFileLock(gitPath, async () => {
    const gitDir = path.join(repoPath, gitPath)
    await fs.mkdir(gitDir, { recursive: true })
    await fs.writeFile(path.join(gitDir, '.gitkeep'), '')
    const git = new GitService(repoPath)
    await git.commit(
      `Create personal folder for ${user.login} [user:${user.login}]`,
      { name: authorName, email: authorEmail },
      [`${gitPath}/.gitkeep`],
    )
  })

  try {
    return await prisma.folder.create({
      data: {
        parentId: null,
        name: user.login,
        gitPath,
        createdById: userId,
        ownerId: userId,
      },
    })
  } catch (err) {
    // P2002: concurrent provisioning won the race — return the winner.
    if ((err as { code?: string }).code === 'P2002') {
      const winner = await prisma.folder.findFirst({ where: { ownerId: userId } })
      if (winner) return winner
    }
    throw err
  }
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
): Promise<FolderPermissionLevel | null> {
  // Gather all folder IDs from this node up to root
  const folderIds = await collectFolderAncestors(folderId)

  // Owning any folder in the ancestry (the user's personal root) implies
  // full ADMIN over the whole subtree.
  const owned = await prisma.folder.findFirst({
    where: { id: { in: folderIds }, ownerId: userId },
    select: { id: true },
  })
  if (owned) return 'ADMIN'

  // Fetch all permissions for this user on any folder in the path
  const permissions = await prisma.folderPermission.findMany({
    where: {
      folderId: { in: folderIds },
      userId,
    },
    select: { permission: true },
  })

  // No explicit permission in the ancestry => no access (admins bypass at the
  // call site). Returning null instead of an implicit VIEW closes the hole
  // where every user could read every folder.
  if (permissions.length === 0) return null

  return permissions
    .map((p: { permission: string }) => p.permission as FolderPermissionLevel)
    .reduce((acc: FolderPermissionLevel, p: FolderPermissionLevel) => maxPermission(acc, p))
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
  ownedFolderIds?: Set<string>,
): FolderPermissionLevel | null {
  const currentPath: string[] = []
  let currentId: string | null = folderId
  while (currentId) {
    currentPath.push(currentId)
    const f = folderMap.get(currentId)
    if (!f) break
    currentId = f.parentId
  }

  let effective: FolderPermissionLevel | null = null
  for (const fid of currentPath) {
    if (ownedFolderIds?.has(fid)) {
      effective = 'ADMIN'
      break
    }
    const p = permissionMap.get(fid)
    if (p) {
      effective = effective === null ? p : maxPermission(effective, p)
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
  mode: 'GIT' | 'SNAPSHOT'
  createdAt: Date
  createdById: string | null
  ownerId: string | null
}

interface DocumentRow {
  id: string
  folderId: string
  title: string
  kind: 'MARKDOWN' | 'EXCALIDRAW'
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

  const createdBy = await prisma.user.findUnique({
    where: { id: createdById },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = createdBy?.gitName ?? createdBy?.login ?? 'Unknown'
  const authorEmail = createdBy?.gitEmail ?? `${createdBy?.login ?? 'unknown'}@mdcollab.local`

  const gitDir = path.join(repoPath, gitPath)
  const git = new GitService(repoPath)

  // Serialize filesystem mutation with document ops / yjs auto-save
  await withFileLock(gitPath, async () => {
    await fs.mkdir(gitDir, { recursive: true })
    await fs.writeFile(path.join(gitDir, '.gitkeep'), '')

    await git.commit(
      `Create folder ${name} [user:${createdBy?.login ?? 'unknown'}]`,
      { name: authorName, email: authorEmail },
      [`${gitPath}/.gitkeep`],
    )
  })

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

  // Personal roots are immutable: their gitPath is the user's stable home.
  if (folder.ownerId) {
    throw Object.assign(new Error('Personal folders cannot be renamed'), { statusCode: 403 })
  }

  const { name: newName } = input
  const oldGitPath = folder.gitPath
  const parentId = folder.parentId
  const parent = parentId
    ? await prisma.folder.findUnique({ where: { id: parentId } })
    : null
  const newGitPath = parent
    ? joinGitPath(parent.gitPath, newName)
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = user?.gitName ?? user?.login ?? 'Unknown'
  const authorEmail = user?.gitEmail ?? `${user?.login ?? 'unknown'}@mdcollab.local`

  // Serialize the move + commit with other folder/document ops
  await withFileLock(oldGitPath, async () => {
    await git.move(oldGitPath, newGitPath)
    await git.commit(
      `Rename folder ${folder.name} -> ${newName} [user:${user?.login ?? 'unknown'}]`,
      { name: authorName, email: authorEmail },
      [], // git mv staged the rename; commit staged only, do not sweep other files
    )
  })

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

  // Personal roots are immutable: they are the user's stable home.
  if (folder.ownerId) {
    throw Object.assign(new Error('Personal folders cannot be deleted'), { statusCode: 403 })
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true, gitName: true, gitEmail: true },
  }) as UserRow | null
  const authorName = user?.gitName ?? user?.login ?? 'Unknown'
  const authorEmail = user?.gitEmail ?? `${user?.login ?? 'unknown'}@mdcollab.local`

  // Serialize the removal + commit with other folder/document ops
  await withFileLock(folder.gitPath, async () => {
    await git.remove(folder.gitPath)
    await git.commit(
      `Delete folder ${folder.name} [user:${user?.login ?? 'unknown'}]`,
      { name: authorName, email: authorEmail },
      [], // git rm staged the deletion; commit staged only, do not sweep
    )
  })

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
  // Everyone gets a personal root — provision it on first need (covers the
  // web dashboard and the MCP server through the same funnel).
  await ensurePersonalFolder(userId)

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
      kind: d.kind,
      filePath: d.filePath,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }))

    return {
      id: f.id,
      name: f.name,
      mode: f.mode,
      parentId: f.parentId,
      gitPath: f.gitPath,
      ownerId: f.ownerId,
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

  // Personal root + its whole subtree is owned: implied ADMIN for the owner
  const personalRoot = allFolders.find((f) => f.ownerId === userId) ?? null
  const ownedFolderIds = new Set<string>()
  if (personalRoot) {
    const queue = [personalRoot.id]
    while (queue.length > 0) {
      const fid = queue.pop()!
      if (ownedFolderIds.has(fid)) continue
      ownedFolderIds.add(fid)
      for (const f of allFolders) {
        if (f.parentId === fid) queue.push(f.id)
      }
    }
  }

  // Build effective permission for each folder
  const effectivePermissions = new Map<string, FolderPermissionLevel | null>()
  for (const f of allFolders) {
    effectivePermissions.set(
      f.id,
      computeEffectivePermissionFromAncestors(f.id, folderMap, permissionMap, ownedFolderIds),
    )
  }

  // Only include folders where the user has an explicit permission in the
  // ancestry or owns the subtree (null means no access). Admins use
  // buildFullTree instead.
  const accessibleFolderIds = new Set(
    [...effectivePermissions.entries()]
      .filter(([, perm]) => perm !== null)
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
      kind: d.kind,
      filePath: d.filePath,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }))

    const permission = effectivePermissions.get(f.id) ?? 'VIEW'

    // Only include folders that have either accessible children or documents
    // — except the personal root, which stays visible even when empty so the
    // UI always has a creation target.
    if (children.length === 0 && documents.length === 0 && f.id !== personalRoot?.id) return null

    return {
      id: f.id,
      name: f.name,
      mode: f.mode,
      parentId: f.parentId,
      gitPath: f.gitPath,
      ownerId: f.ownerId,
      permission,
      children,
      documents,
    }
  }

  // Roots are the topmost accessible nodes: the personal root plus any
  // shared folder whose ancestors the user cannot see (rendered under its
  // parent otherwise).
  const tree: FolderTreeNode[] = []
  for (const f of allFolders) {
    if (!accessibleFolderIds.has(f.id)) continue
    const parent = f.parentId ? folderMap.get(f.parentId) : null
    if (parent && accessibleFolderIds.has(parent.id)) continue
    const node = buildNode(f)
    if (node !== null) tree.push(node)
  }

  return { tree }
}

export async function updateFolderSettings(
  folderId: string,
  settings: { mode?: 'GIT' | 'SNAPSHOT' },
) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  if (settings.mode && settings.mode !== 'GIT' && settings.mode !== 'SNAPSHOT') {
    throw Object.assign(new Error('Invalid folder mode'), { statusCode: 400 })
  }

  return prisma.folder.update({
    where: { id: folderId },
    data: {
      ...(settings.mode ? { mode: settings.mode } : {}),
    },
    select: { id: true, name: true, mode: true, gitPath: true },
  })
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
