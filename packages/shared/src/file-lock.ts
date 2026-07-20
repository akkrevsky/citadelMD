import { Redis } from 'ioredis'

export interface FileLockOptions {
  /** Timeout in milliseconds to wait for lock acquisition (default: 30000) */
  timeout?: number
  /** Retry delay in milliseconds between lock attempts (default: 100) */
  retryDelay?: number
  /** Lock expiration in milliseconds for auto-cleanup (default: 10000) */
  lockExpiration?: number
}

export interface WithFileLock {
  <T>(filePath: string, fn: () => Promise<T>): Promise<T>
}

/**
 * Lua script to safely release a lock only if we own it.
 * This prevents race conditions where a lock expires and another process
 * acquires it before we try to release.
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`

/**
 * Creates a Redis-based distributed file locking utility.
 * 
 * Uses Redis SET with NX (only if not exists) and PX (expiration) flags
 * to implement distributed locking. Supports timeout and retry mechanisms.
 * 
 * @param redis - Redis client instance
 * @param options - Lock configuration options
 * @returns Function to execute code with file lock protection
 */
export function createFileLock(
  redis: Redis,
  options: FileLockOptions = {}
): WithFileLock {
  const {
    timeout = 30000, // 30 seconds default timeout
    retryDelay = 100, // 100ms default retry delay
    lockExpiration = 10000 // 10 seconds default lock expiration
  } = options

  return async function withFileLock<T>(
    filePath: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockKey = `lock:file:${filePath}`
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const startTime = Date.now()

    // Try to acquire the lock with timeout and retry
    while (Date.now() - startTime < timeout) {
      const result = await redis.set(
        lockKey,
        lockValue,
        'PX', // Set expiration in milliseconds
        lockExpiration,
        'NX' // Only set if key doesn't exist
      )

      if (result === 'OK') {
        // Successfully acquired lock
        try {
          return await fn()
        } finally {
          // Release lock using Lua script to prevent race conditions
          await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue)
        }
      }

      // Lock acquisition failed, wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }

    throw new Error(`Failed to acquire file lock for "${filePath}" within ${timeout}ms timeout`)
  }
}