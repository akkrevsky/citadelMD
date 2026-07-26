import type { UserRole } from '@citadelmd/shared'

export interface MCPUser {
  id: string
  login: string
  role: UserRole
}

/**
 * Validate an API key by calling the backend's /api/auth/me endpoint.
 * Returns the user record or null if the key is invalid.
 */
export async function resolveApiKey(apiKey: string, backendUrl: string): Promise<MCPUser | null> {
  try {
    const response = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { Authorization: `ApiKey ${apiKey}` },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { user: { id: string; login: string; role: UserRole } }
    return data.user
  } catch {
    return null
  }
}
