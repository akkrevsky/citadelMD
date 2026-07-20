import { Redis } from 'ioredis'
import { createFileLock, type WithFileLock } from '@citadelmd/shared'

/**
 * Shared singleton Redis client + file lock used by document.service and
 * folder.service. Using one connection avoids every service (and every
 * DocumentService instance) opening its own.
 *
 * The lock key namespace is `lock:file:<path>` (see packages/shared file-lock),
 * which yjs-server's auto-save also honors via createTryFileLock so that the
 * backend git operations and the yjs auto-save serialize on the same path.
 */
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl)
redis.on('error', (err: Error) => {
  console.error('[lock] redis error:', err.message)
})

export const withFileLock: WithFileLock = createFileLock(redis)
