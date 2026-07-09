import { getRedisClient } from './redisClient.service';
import { logger } from '../utils/logger';

/**
 * Generic cache service that wraps Redis get/set with TTL
 */
export class CacheService {
  private readonly defaultTTL: number = 60; // 60 seconds default

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const value = await redis.get(key);
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache GET error for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const ttl = ttlSeconds || this.defaultTTL;
      
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache DEL error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache EXISTS error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get or set cache with a factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate fresh data
    const freshData = await factory();

    // Store in cache
    if (freshData !== null && freshData !== undefined) {
      await this.set(key, freshData, ttlSeconds);
    }

    return freshData;
  }

  /**
   * Clear all cache entries with a specific prefix
   */
  async clearByPrefix(prefix: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${prefix}:*`);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await redis.del(...keys);
      return deleted;
    } catch (error) {
      logger.error(`Cache clear by prefix error for "${prefix}":`, error);
      return 0;
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();