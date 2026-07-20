import { Redis } from 'ioredis'

export class RedisLockService {
  private redis: Redis
  
  constructor(redisUrl = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl)
  }
  
  async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `file_lock:${filePath}`
    const lockValue = `${Date.now()}_${Math.random()}`
    const lockTTL = 30 // 30 seconds
    
    // Acquire lock
    const acquired = await this.redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX')
    
    if (!acquired) {
      throw new Error(`File is locked: ${filePath}`)
    }
    
    try {
      return await fn()
    } finally {
      // Release lock (only if we still own it)
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `
      await this.redis.eval(script, 1, lockKey, lockValue)
    }
  }
}