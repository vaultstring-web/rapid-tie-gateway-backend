// src/services/redisClient.service.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;
let isRedisAvailable: boolean = true;

const createMockRedis = (): any => ({
  get: async () => null,
  setex: async () => {},
  del: async () => {},
  on: () => {},
  quit: async () => {},
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
