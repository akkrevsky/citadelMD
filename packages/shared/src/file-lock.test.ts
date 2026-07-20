import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Redis } from 'ioredis'
import { createFileLock, type FileLockOptions } from './file-lock.js'

/**
 * Mock Redis client that provides the Redis interface for testing
 * without requiring an actual Redis server
 */
class MockRedis {
  private store = new Map<string, { value: string; expiry: number }>()
  private isConnected = true

  constructor(private shouldReject = false) {}

  async set(key: string, value: string, expireType?: string, expiration?: number, setMode?: string): Promise<string | null> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    if (setMode === 'NX' && this.store.has(key)) {
      // Only set if key doesn't exist
      const existing = this.store.get(key)!
      if (existing.expiry > Date.now()) {
        return null // Key exists and not expired
      }
    }

    const expiry = expireType === 'PX' && expiration ? Date.now() + expiration : Infinity
    this.store.set(key, { value, expiry })
    return 'OK'
  }

  async get(key: string): Promise<string | null> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    const entry = this.store.get(key)
    if (!entry || entry.expiry <= Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async del(key: string): Promise<number> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    const existed = this.store.has(key)
    this.store.delete(key)
    return existed ? 1 : 0
  }

  async exists(key: string): Promise<number> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    const entry = this.store.get(key)
    if (!entry || entry.expiry <= Date.now()) {
      this.store.delete(key)
      return 0
    }
    return 1
  }

  async pttl(key: string): Promise<number> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    const entry = this.store.get(key)
    if (!entry) return -2 // Key doesn't exist
    if (entry.expiry === Infinity) return -1 // No expiration
    
    const remaining = entry.expiry - Date.now()
    return remaining > 0 ? remaining : -2
  }

  async eval(script: string, numKeys: number, ...args: string[]): Promise<any> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    // Simple implementation of the release lock script
    if (script.includes('redis.call("get"') && script.includes('redis.call("del"')) {
      const key = args[0]
      const value = args[1]
      const current = await this.get(key)
      if (current === value) {
        return await this.del(key)
      }
      return 0
    }
    return 0
  }

  async flushdb(): Promise<string> {
    if (this.shouldReject) {
      throw new Error('Mock Redis connection error')
    }

    this.store.clear()
    return 'OK'
  }

  async quit(): Promise<string> {
    this.isConnected = false
    return 'OK'
  }
}

/**
 * Try to create a real Redis connection, fall back to mock if Redis is not available
 */
async function createRedisClient(): Promise<{ redis: Redis | MockRedis; isMock: boolean }> {
  // First try to connect to real Redis
  try {
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 15, // Use Redis DB 15 for tests
      maxRetriesPerRequest: 1,
      lazyConnect: true
    })
    // Test the connection
    await redis.ping()
    await redis.flushdb() // Clear test database
    
    return { redis, isMock: false }
  } catch (error) {
    // If real Redis is not available, use mock
    console.warn('Redis not available, using mock Redis for tests:', (error as Error).message)
    return { redis: new MockRedis(), isMock: true }
  }
}

describe('file-lock', () => {
  let redis: Redis | MockRedis
  let isMock: boolean

  beforeEach(async () => {
    const client = await createRedisClient()
    redis = client.redis
    isMock = client.isMock
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
      const withFileLock = createFileLock(redis as Redis)
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
      const withFileLock = createFileLock(redis as Redis, { retryDelay: 50 })
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
      const withFileLock = createFileLock(redis as Redis, { 
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
      const withFileLock = createFileLock(redis as Redis)
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
      const withFileLock = createFileLock(redis as Redis)
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
      const withFileLock = createFileLock(redis as Redis, { lockExpiration })
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
      // Create a Redis client that simulates connection errors
      const badRedis = new MockRedis(true) // shouldReject = true

      const withFileLock = createFileLock(badRedis as unknown as Redis, { timeout: 1000 })

      await expect(
        withFileLock('/test/error/file.md', async () => 'should not reach here')
      ).rejects.toThrow()
    })

    it('should work with nested locks on different files', async () => {
      const withFileLock = createFileLock(redis as Redis)
      const file1 = '/test/nested/file1.md'
      const file2 = '/test/nested/file2.md'

      const result = await withFileLock(file1, async () => {
        return await withFileLock(file2, async () => {
          return 'nested success'
        })
      })

      expect(result).toBe('nested success')
    })

    it('should work in environment without Redis when using mock', async () => {
      // This test ensures our mock implementation works correctly
      if (isMock) {
        const mockRedis = new MockRedis()
        const withFileLock = createFileLock(mockRedis as unknown as Redis)
        
        const result = await withFileLock('/test/mock/file.md', async () => {
          return 'mock success'
        })
        
        expect(result).toBe('mock success')
      } else {
        // If real Redis is available, still test the functionality
        const withFileLock = createFileLock(redis as Redis)
        
        const result = await withFileLock('/test/real/file.md', async () => {
          return 'real success'
        })
        
        expect(result).toBe('real success')
      }
    })
  })

  describe('lock key format', () => {
    it('should use correct lock key format', async () => {
      const withFileLock = createFileLock(redis as Redis, { lockExpiration: 5000 })
      const filePath = '/some/deeply/nested/path/file.md'

      await withFileLock(filePath, async () => {
        const expectedKey = `lock:file:${filePath}`
        const exists = await redis.exists(expectedKey)
        expect(exists).toBe(1)
      })
    })

    it('should handle special characters in file paths', async () => {
      const withFileLock = createFileLock(redis as Redis)
      const filePath = '/test/file with spaces & special-chars.md'

      const result = await withFileLock(filePath, async () => 'success with special chars')
      expect(result).toBe('success with special chars')
    })
  })
})