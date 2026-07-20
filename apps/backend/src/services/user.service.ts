import crypto from 'node:crypto'
import type { User, UserRole } from '@citadelmd/shared'
import { prisma } from '../prisma.js'
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from './auth.service.js'

export interface CreateUserInput {
  login: string
  password: string
  role: UserRole
  displayName?: string | null
  gitName?: string | null
  gitEmail?: string | null
}

export interface UpdateUserInput {
  role?: UserRole
  displayName?: string | null
  active?: boolean
  password?: string
  gitName?: string | null
  gitEmail?: string | null
  regenerateApiKey?: boolean
}

export interface UserResponse {
  id: string
  login: string
  role: UserRole
  displayName: string | null
  gitName: string | null
  gitEmail: string | null
  apiKey: string | null
  active: boolean
  createdAt: Date
}

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    login: user.login,
    role: user.role as UserRole,
    displayName: user.displayName,
    gitName: user.gitName,
    gitEmail: user.gitEmail,
    apiKey: user.apiKey,
    active: user.active,
    createdAt: user.createdAt,
  }
}

export async function listUsers(): Promise<{ data: UserResponse[]; total: number }> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return {
    data: users.map(toUserResponse),
    total: users.length,
  }
}

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { login: input.login } })
  if (existing) {
    throw Object.assign(new Error('Login already taken'), { statusCode: 409 })
  }

  const passwordError = validatePassword(input.password, input.login)
  if (passwordError) {
    throw Object.assign(new Error(passwordError), { statusCode: 422 })
  }

  const passwordHash = await hashPassword(input.password)
  const apiKey = generateApiKey()

  const user = await prisma.user.create({
    data: {
      login: input.login,
      passwordHash,
      role: input.role,
      displayName: input.displayName ?? null,
      gitName: input.gitName ?? null,
      gitEmail: input.gitEmail ?? null,
      apiKey,
    },
  })

  return toUserResponse(user)
}

export async function getUserById(id: string): Promise<UserResponse | null> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return null
  return toUserResponse(user)
}

export async function updateUser(
  id: string,
  input: UpdateUserInput
): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }

  const updateData: Record<string, unknown> = {}

  if (input.role !== undefined) updateData.role = input.role
  if (input.displayName !== undefined) updateData.displayName = input.displayName
  if (input.active !== undefined) updateData.active = input.active
  if (input.gitName !== undefined) updateData.gitName = input.gitName
  if (input.gitEmail !== undefined) updateData.gitEmail = input.gitEmail

  if (input.password) {
    const passwordError = validatePassword(input.password, existing.login)
    if (passwordError) {
      throw Object.assign(new Error(passwordError), { statusCode: 422 })
    }
    updateData.passwordHash = await hashPassword(input.password)
  }

  if (input.regenerateApiKey) {
    updateData.apiKey = generateApiKey()
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  })

  return toUserResponse(user)
}

export async function deactivateUser(id: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }

  // Check if user has documents
  const docCount = await prisma.document.count({ where: { createdById: id } })
  if (docCount > 0) {
    throw Object.assign(
      new Error('Cannot deactivate user: user owns documents'),
      { statusCode: 409 }
    )
  }

  await prisma.user.update({
    where: { id },
    data: { active: false },
  })
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    throw Object.assign(new Error('Current password is incorrect'), {
      statusCode: 401,
    })
  }

  const passwordError = validatePassword(newPassword, user.login)
  if (passwordError) {
    throw Object.assign(new Error(passwordError), { statusCode: 422 })
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  })
}
