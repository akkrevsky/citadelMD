/**
 * One-time migration: convert the legacy global Root into the admin's
 * personal folder (users/admin).
 *
 * Run manually with the services STOPPED (no yjs auto-save racing the git
 * mv), on a clean working tree:
 *
 *   pnpm --filter backend exec prisma migrate deploy
 *   pnpm --filter backend exec tsx prisma/migrate-personal-folders.ts
 *
 * Idempotent: exits 0 with "already migrated" when the admin already has a
 * personal folder.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { GitService } from '@citadelmd/shared'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const repoPath = process.env.GIT_REPO_PATH
  if (!repoPath) {
    console.error('FATAL: GIT_REPO_PATH env var is required')
    process.exit(1)
  }

  const admin = await prisma.user.findUnique({ where: { login: 'admin' } })
  if (!admin) {
    console.log('No admin user — nothing to migrate.')
    return
  }

  // Idempotency guard
  const personal = await prisma.folder.findFirst({ where: { ownerId: admin.id } })
  if (personal) {
    console.log(`Already migrated: admin personal folder exists (id=${personal.id}).`)
    return
  }

  const root = await prisma.folder.findFirst({
    where: { parentId: null, name: 'Root', ownerId: null },
  })

  if (!root) {
    console.log('No legacy Root folder — nothing to migrate.')
    return
  }

  const git = new GitService(repoPath)
  const author = {
    name: admin.gitName ?? admin.login,
    email: admin.gitEmail ?? `${admin.login}@mdcollab.local`,
  }

  // The migration rewrites tracked paths; abort on a dirty working tree.
  if (await git.hasAnyChanges()) {
    console.error('FATAL: git working tree has uncommitted changes — stop the services and clean it first.')
    process.exit(1)
  }

  const personalGitPath = 'users/admin'
  console.log(`Migrating legacy Root into ${personalGitPath}...`)

  // 1. Git: create the destination, then move every top-level tracked entry
  //    (except the repo README and the users/ dir itself) into it.
  await fs.mkdir(path.join(repoPath, personalGitPath), { recursive: true })
  await fs.writeFile(path.join(repoPath, personalGitPath, '.gitkeep'), '')
  await git.commit(
    `Migrate legacy Root into admin personal folder [user:${admin.login}]`,
    author,
    [`${personalGitPath}/.gitkeep`],
  )

  const tracked = await git.listTrackedFiles()
  const topLevel = new Set<string>()
  for (const file of tracked) {
    const top = file.split('/')[0]
    if (top === 'README.md' || top === 'users') continue
    topLevel.add(top)
  }

  let movedCount = 0
  for (const entry of topLevel) {
    await git.move(entry, `${personalGitPath}/${entry}`)
    movedCount++
  }
  await git.commit(
    `Migrate legacy Root into admin personal folder [user:${admin.login}]`,
    author,
    [],
  )
  console.log(`  moved ${movedCount} top-level entries in git`)

  // 2. DB: convert the Root row into the admin's personal root and prefix
  //    every descendant gitPath / document filePath.
  const allFolders = await prisma.folder.findMany({
    select: { id: true, parentId: true, gitPath: true },
  })
  const subtreeIds = new Set<string>()
  const queue = [root.id]
  while (queue.length > 0) {
    const fid = queue.pop()!
    if (subtreeIds.has(fid)) continue
    subtreeIds.add(fid)
    for (const f of allFolders) {
      if (f.parentId === fid) queue.push(f.id)
    }
  }

  let folderCount = 0
  for (const f of allFolders) {
    if (!subtreeIds.has(f.id)) continue
    if (f.id === root.id) continue
    await prisma.folder.update({
      where: { id: f.id },
      data: { gitPath: `${personalGitPath}/${f.gitPath}` },
    })
    folderCount++
  }
  await prisma.folder.update({
    where: { id: root.id },
    data: { name: admin.login, gitPath: personalGitPath, ownerId: admin.id },
  })

  const docs = await prisma.document.findMany({
    where: { folderId: { in: [...subtreeIds] } },
    select: { id: true, filePath: true },
  })
  for (const doc of docs) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { filePath: `${personalGitPath}/${doc.filePath}` },
    })
  }

  console.log(
    `Migration complete: ${folderCount} descendant folders + ${docs.length} documents moved under ${personalGitPath}`,
  )
  console.log('Content created by other users now lives in the admin personal folder — re-share it via the folder permissions UI.')
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
