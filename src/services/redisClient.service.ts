// src/services/redisClient.service.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl);
    
    redisClient.on('connect', () => {
      console.log('✅ Redis client connected');
    });
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis client error:', err);
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
