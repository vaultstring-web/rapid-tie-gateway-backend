// src/services/redisClient.service.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

export class RedisConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisConnectionError';
  }
}

const getRedisClient = (): Redis => {

  if (redisClient && redisClient.status === 'ready') {
    connectionAttempts = 0; 
    return redisClient;
  }

  
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    throw new RedisConnectionError(
      `Redis connection failed after ${MAX_CONNECTION_ATTEMPTS} attempts. Service temporarily unavailable.`
    );
  }

 
  if (!redisClient || redisClient.status === 'end') {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        connectionAttempts = times;
        
        if (times > MAX_CONNECTION_ATTEMPTS) {
          console.error(`❌ Redis connection failed after ${times} attempts`);
          return null; 
        }
        
        const delay = Math.min(times * 1000, 5000);
        console.warn(`⚠️ Redis connection attempt ${times} failed. Retrying in ${delay}ms...`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    // Handle connection events
    redisClient.on('connect', () => {
      console.log('✅ Redis client connected');
      connectionAttempts = 0;
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis client ready');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis client error:', err.message);
    });

    redisClient.on('close', () => {
      console.warn('⚠️ Redis connection closed');
    });
  }

  // Check if connection is ready
  if (redisClient.status !== 'ready') {
    connectionAttempts++;
    throw new RedisConnectionError(
      `Redis connection not ready (status: ${redisClient.status}). Service temporarily unavailable.`
    );
  }

  connectionAttempts = 0;
  return redisClient;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
};

export { getRedisClient };