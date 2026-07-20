import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
  // 2. Root folder
  // -------------------------------------------------------
  const existingRoot = await prisma.folder.findFirst({
    where: { parentId: null, name: 'Root' },
  })

  if (existingRoot) {
    console.log(`Root folder already exists (id=${existingRoot.id}), skipping`)
  } else {
    const root = await prisma.folder.create({
      data: {
        parentId: null,
        name: 'Root',
        gitPath: '',
        createdById: adminId,
      },
    })

    console.log(`Created root folder: id=${root.id}, name=${root.name}, gitPath="${root.gitPath}"`)
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
