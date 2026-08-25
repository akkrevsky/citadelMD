import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { GitService } from '@citadelmd/shared'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) {
    console.error('FATAL: ADMIN_PASSWORD env var is required')
    process.exit(1)
  }
  return pw
}

async function seed(): Promise<void> {
  console.log('=== citadelMD seed ===')

  // -------------------------------------------------------
  // 1. Admin user
  // -------------------------------------------------------
  const adminLogin = 'admin'
  const existingAdmin = await prisma.user.findUnique({ where: { login: adminLogin } })

  let adminId: string

  if (existingAdmin) {
    console.log(`Admin user "${adminLogin}" already exists (id=${existingAdmin.id}), skipping`)
    adminId = existingAdmin.id
  } else {
    const passwordHash = await hashPassword(getAdminPassword())
    const apiKey = generateApiKey()

    const admin = await prisma.user.create({
      data: {
        login: adminLogin,
        passwordHash,
        role: 'ADMIN',
        displayName: 'Administrator',
        gitName: 'Administrator',
        gitEmail: 'admin@mdcollab.local',
        apiKey,
        active: true,
      },
    })

    adminId = admin.id
    console.log(`Created admin user: id=${admin.id}, login=${admin.login}, role=${admin.role}`)
    console.log(`  apiKey: ${admin.apiKey}`)
  }

  // -------------------------------------------------------
  // 2. Admin personal folder (users/admin)
  // -------------------------------------------------------
  const existingPersonal = await prisma.folder.findFirst({
    where: { ownerId: adminId },
  })

  if (existingPersonal) {
    console.log(`Admin personal folder already exists (id=${existingPersonal.id}), skipping`)
  } else {
    const legacyRoot = await prisma.folder.findFirst({
      where: { parentId: null, name: 'Root', ownerId: null },
    })

    if (legacyRoot) {
      console.log(
        'Legacy Root folder detected — run prisma/migrate-personal-folders.ts to convert it; skipping personal folder creation',
      )
    } else {
      const gitPath = 'users/admin'
      const repoPath = process.env.GIT_REPO_PATH || '/data/docs'
      let gitCreated = false

      try {
        await fs.mkdir(path.join(repoPath, gitPath), { recursive: true })
        await fs.writeFile(path.join(repoPath, gitPath, '.gitkeep'), '')
        const git = new GitService(repoPath)
        await git.commit(
          `Create personal folder for admin [user:${adminLogin}]`,
          { name: 'Administrator', email: 'admin@mdcollab.local' },
          [`${gitPath}/.gitkeep`],
        )
        gitCreated = true
      } catch (err) {
        console.warn(
          `Could not create git dir for personal folder (${(err as Error).message}); continuing without commit`,
        )
      }

      const root = await prisma.folder.create({
        data: {
          parentId: null,
          name: adminLogin,
          gitPath,
          createdById: adminId,
          ownerId: adminId,
        },
      })

      console.log(
        `Created admin personal folder: id=${root.id}, name=${root.name}, gitPath="${root.gitPath}"${gitCreated ? ', git dir committed' : ', git dir pending'}`,
      )
    }
  }

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  const userCount = await prisma.user.count()
  const folderCount = await prisma.folder.count()
  console.log(`\nSeed complete. DB now has:`)
  console.log(`  Users:  ${userCount}`)
  console.log(`  Folders: ${folderCount}`)
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
