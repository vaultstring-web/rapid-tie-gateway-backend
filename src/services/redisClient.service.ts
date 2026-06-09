// src/services/redisClient.service.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;
let isRedisAvailable: boolean = true;

// In-memory store for mock redis
const mockStore = new Map();

const createMockRedis = (): any => ({
  get: async (key: string) => mockStore.get(key) || null,
  set: async (key: string, value: string, ..._args: any[]) => {
    // Simple implementation that ignores TTL/NX for mock
    mockStore.set(key, value);
    return 'OK';
  },
  setex: async (key: string, _ttl: number, value: string) => {
    mockStore.set(key, value);
  },
  keys: async (pattern: string) => {
    const results: string[] = [];
    // Simple pattern matching - supports * wildcard at end
    const searchPattern = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${searchPattern}$`);
    for (const key of mockStore.keys()) {
      if (regex.test(key)) {
        results.push(key);
      }
    }
    return results;
  },
  del: async (...keys: string[]) => {
    for (const key of keys) {
      mockStore.delete(key);
    }
    return keys.length;
  },
  on: () => {},
  quit: async () => {
    mockStore.clear();
  },
});

export const getRedisClient = (): any => {
  if (!isRedisAvailable) {
    return createMockRedis();
  }

  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 2) {
          isRedisAvailable = false;
          console.warn('⚠️ Redis unavailable after multiple attempts - disabling cache');
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });
    
    redisClient.on('connect', () => {
      console.log('✅ Redis client connected');
      isRedisAvailable = true;
    });
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis client error:', err.message);
    });
  }
  
  return redisClient;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
};

export default { getRedisClient, closeRedisConnection };
