import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Redis } from 'ioredis'
import { createFileLock, type FileLockOptions } from './file-lock.js'

describe('file-lock', () => {
  let redis: Redis
  const testDb = 15 // Use Redis DB 15 for tests

  beforeEach(async () => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: testDb,
      maxRetriesPerRequest: 1
    })
    await redis.flushdb() // Clear test database
  })

  afterEach(async () => {
    if (redis) {
      await redis.flushdb()
      await redis.quit()
    }
  })

  describe('createFileLock', () => {
    it('should successfully acquire and release lock', async () => {
      const withFileLock = createFileLock(redis)
      const filePath = '/test/path/file.md'
      let executed = false

      const result = await withFileLock(filePath, async () => {
        executed = true
        return 'success'
      })

      expect(result).toBe('success')
      expect(executed).toBe(true)

      // Verify lock was released
      const lockKey = `lock:file:${filePath}`
      const lockExists = await redis.exists(lockKey)
      expect(lockExists).toBe(0)
    })

    it('should prevent concurrent access to same file', async () => {
      const withFileLock = createFileLock(redis, { retryDelay: 50 })
      const filePath = '/test/concurrent/file.md'
      const executionOrder: number[] = []

      // Start first operation that holds lock for 200ms
      const promise1 = withFileLock(filePath, async () => {
        executionOrder.push(1)
        await new Promise(resolve => setTimeout(resolve, 200))
        return 'first'
      })

      // Wait a bit to ensure first operation gets the lock
      await new Promise(resolve => setTimeout(resolve, 10))

      // Start second operation that should wait for first to complete
      const promise2 = withFileLock(filePath, async () => {
        executionOrder.push(2)
        return 'second'
      })

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toBe('first')
      expect(result2).toBe('second')
      expect(executionOrder).toEqual([1, 2]) // First should execute before second
    })

    it('should timeout if lock cannot be acquired', async () => {
      const shortTimeout = 100
      const withFileLock = createFileLock(redis, { 
        timeout: shortTimeout,
        retryDelay: 25
      })
      const filePath = '/test/timeout/file.md'

      // First operation holds lock longer than timeout
      const promise1 = withFileLock(filePath, async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        return 'first'
      })

      // Wait to ensure first operation gets the lock
      await new Promise(resolve => setTimeout(resolve, 10))

      // Second operation should timeout
      await expect(
        withFileLock(filePath, async () => 'second')
      ).rejects.toThrow(`Failed to acquire file lock for "${filePath}" within ${shortTimeout}ms timeout`)

      await promise1 // Clean up first operation
    })

    it('should release lock even when function throws exception', async () => {
      const withFileLock = createFileLock(redis)
      const filePath = '/test/exception/file.md'
      const error = new Error('Test exception')

      await expect(
        withFileLock(filePath, async () => {
          throw error
        })
      ).rejects.toThrow('Test exception')

      // Verify lock was released despite exception
      const lockKey = `lock:file:${filePath}`
      const lockExists = await redis.exists(lockKey)
      expect(lockExists).toBe(0)

      // Verify we can acquire lock again
      const result = await withFileLock(filePath, async () => 'recovered')
      expect(result).toBe('recovered')
    })

    it('should handle different file paths independently', async () => {
      const withFileLock = createFileLock(redis)
      const file1 = '/test/independent/file1.md'
      const file2 = '/test/independent/file2.md'
      const results: string[] = []

      // Both operations should run concurrently since they lock different files
      const [result1, result2] = await Promise.all([
        withFileLock(file1, async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          results.push('file1')
          return 'first'
        }),
        withFileLock(file2, async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          results.push('file2')
          return 'second'
        })
      ])

      expect(result1).toBe('first')
      expect(result2).toBe('second')
      expect(results).toHaveLength(2)
      expect(results).toContain('file1')
      expect(results).toContain('file2')
    })

    it('should use custom lock expiration', async () => {
      const lockExpiration = 200
      const withFileLock = createFileLock(redis, { lockExpiration })
      const filePath = '/test/expiration/file.md'

      await withFileLock(filePath, async () => {
        const lockKey = `lock:file:${filePath}`
        const ttl = await redis.pttl(lockKey)
        
        // TTL should be close to our expiration time (within 50ms tolerance)
        expect(ttl).toBeGreaterThan(lockExpiration - 50)
        expect(ttl).toBeLessThanOrEqual(lockExpiration)
      })
    })

    it('should handle Redis connection errors gracefully', async () => {
      // Create a Redis client with invalid config to simulate connection errors
      const badRedis = new Redis({
        host: 'nonexistent.host',
        port: 6379,
        db: testDb,
        maxRetriesPerRequest: 0 // Don't retry
      })

      const withFileLock = createFileLock(badRedis, { timeout: 1000 })

      await expect(
        withFileLock('/test/error/file.md', async () => 'should not reach here')
      ).rejects.toThrow()

      await badRedis.quit()
    })

    it('should work with nested locks on different files', async () => {
      const withFileLock = createFileLock(redis)
      const file1 = '/test/nested/file1.md'
      const file2 = '/test/nested/file2.md'

      const result = await withFileLock(file1, async () => {
        return await withFileLock(file2, async () => {
          return 'nested success'
        })
      })

      expect(result).toBe('nested success')
    })
  })

  describe('lock key format', () => {
    it('should use correct lock key format', async () => {
      const withFileLock = createFileLock(redis, { lockExpiration: 5000 })
      const filePath = '/some/deeply/nested/path/file.md'

      await withFileLock(filePath, async () => {
        const expectedKey = `lock:file:${filePath}`
        const exists = await redis.exists(expectedKey)
        expect(exists).toBe(1)
      })
    })

    it('should handle special characters in file paths', async () => {
      const withFileLock = createFileLock(redis)
      const filePath = '/test/file with spaces & special-chars.md'

      const result = await withFileLock(filePath, async () => 'success with special chars')
      expect(result).toBe('success with special chars')
    })
  })
})