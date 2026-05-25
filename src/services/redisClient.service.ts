import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = createClient({ url });

  redisClient.on('error', (err) => {
    // Avoid crashing the process on Redis disconnects; callers should handle failures.
    console.error('Redis client error:', err);
  });

  await redisClient.connect();
  return redisClient;
}

