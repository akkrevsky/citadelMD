import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { User, UserRole } from '@citadelmd/shared'
import { prisma } from '../prisma.js'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var is required')
  return secret
}

const SALT_ROUNDS = 12
const TOKEN_EXPIRY = '7d'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

export interface AuthResult {
  user: Pick<User, 'id' | 'login' | 'role' | 'displayName'>
  expiresAt: string
  token: string
}

export interface JwtPayload {
  sub: string
  login: string
  role: UserRole
}

export function validatePassword(password: string, login: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters'
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least one digit'
  }
  if (password === login) {
    return 'Password must not be equal to login'
  }
  return null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(user: { id: string; login: string; role: UserRole }): string {
  const payload: JwtPayload = { sub: user.id, login: user.login, role: user.role }
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload
}

export function getCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
  }
}

export async function login(
  loginInput: string,
  password: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { login: loginInput } })
  if (!user || !user.active) {
    throw Object.assign(new Error('Invalid login or password'), { statusCode: 401 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw Object.assign(new Error('Invalid login or password'), { statusCode: 401 })
  }

  const token = signToken(user)
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString()

  return {
    user: {
      id: user.id,
      login: user.login,
      role: user.role as UserRole,
      displayName: user.displayName,
    },
    expiresAt,
    token,
  }
}

export function buildLogoutCookie() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
  }
}
