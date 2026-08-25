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
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { GitService } from '@citadelmd/shared'

const prisma = new PrismaClient()

// simple-git mangles non-ASCII paths in `mv` (escaped quoting) and
// `ls-files` quotes them as C-style escapes; use git directly.
function gitMove(repoPath: string, from: string, to: string): void {
  const quote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
  execSync(`git mv ${quote(from)} ${quote(to)}`, { cwd: repoPath, stdio: 'pipe' })
}

function gitListTrackedFiles(repoPath: string): string[] {
  const raw = execSync('git -c core.quotepath=false ls-files', {
    cwd: repoPath,
    encoding: 'utf8',
  })
  return raw.split('\n').filter((line) => line.length > 0)
}

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

  const personalGitPath = 'users/admin'

  // Idempotency guard: only run the git moves when the admin has no
  // personal folder yet AND a legacy Root still exists.
  const personal = await prisma.folder.findFirst({ where: { ownerId: admin.id } })
  const root = personal
    ? null
    : await prisma.folder.findFirst({
        where: { parentId: null, name: 'Root', ownerId: null },
      })

  if (root) {
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

    console.log(`Migrating legacy Root into ${personalGitPath}...`)

    // 1. Git: create the destination, then move every top-level tracked
    //    entry (except the repo README and the users/ dir itself) into it.
    await fs.mkdir(path.join(repoPath, personalGitPath), { recursive: true })
    await fs.writeFile(path.join(repoPath, personalGitPath, '.gitkeep'), '')
    await git.commit(
      `Migrate legacy Root into admin personal folder [user:${admin.login}]`,
      author,
      [`${personalGitPath}/.gitkeep`],
    )

    const tracked = gitListTrackedFiles(repoPath)
    const topLevel = new Set<string>()
    for (const file of tracked) {
      const top = file.split('/')[0]
      if (top === 'README.md' || top === 'users') continue
      topLevel.add(top)
    }

    let movedCount = 0
    for (const entry of topLevel) {
      gitMove(repoPath, entry, `${personalGitPath}/${entry}`)
      movedCount++
    }
    await git.commit(
      `Migrate legacy Root into admin personal folder [user:${admin.login}]`,
      author,
      [],
    )
    console.log(`  moved ${movedCount} top-level entries in git`)
  } else if (!personal) {
    console.log('No legacy Root folder and no personal folder — nothing to migrate.')
    return
  }

  // 2. DB: convert the Root row (if any) into the admin's personal root and
  //    prefix EVERY folder gitPath / document filePath that does not yet
  //    live under users/ — this also covers legacy top-level folders whose
  //    parentId was null, which the ancestry walk would miss.
  if (root) {
    await prisma.folder.update({
      where: { id: root.id },
      data: { name: admin.login, gitPath: personalGitPath, ownerId: admin.id },
    })
  }

  const unprefixedFolders = await prisma.folder.findMany({
    where: {
      id: { not: personal?.id ?? root?.id ?? '' },
      NOT: { gitPath: { startsWith: 'users/' } },
    },
    select: { id: true, gitPath: true },
  })
  for (const f of unprefixedFolders) {
    await prisma.folder.update({
      where: { id: f.id },
      data: { gitPath: `${personalGitPath}/${f.gitPath}` },
    })
  }

  // Nest the admin's legacy top-level folders (parentId was null) under the
  // personal root so the tree reads as one workspace.
  const personalRootId = personal?.id ?? root?.id
  if (personalRootId) {
    await prisma.folder.updateMany({
      where: {
        parentId: null,
        ownerId: null,
        id: { not: personalRootId },
        gitPath: { startsWith: `${personalGitPath}/` },
      },
      data: { parentId: personalRootId },
    })
  }

  const unprefixedDocs = await prisma.document.findMany({
    where: { NOT: { filePath: { startsWith: 'users/' } } },
    select: { id: true, filePath: true },
  })
  for (const doc of unprefixedDocs) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { filePath: `${personalGitPath}/${doc.filePath}` },
    })
  }

  if (unprefixedFolders.length === 0 && unprefixedDocs.length === 0 && !root) {
    console.log(`Already migrated: everything lives under ${personalGitPath}.`)
  } else {
    console.log(
      `Migration complete: ${unprefixedFolders.length} folders + ${unprefixedDocs.length} documents moved under ${personalGitPath}`,
    )
    console.log('Content created by other users now lives in the admin personal folder — re-share it via the folder permissions UI.')
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
