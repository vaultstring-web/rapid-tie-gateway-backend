import { getRedisClient } from './redisClient.service';

const LOCK_NAMESPACE = 'inventory_lock';
const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

export interface LockInfo {
  tierId: string;
  quantity: number;
  sessionToken: string;
  createdAt: string;
}

export async function acquireLock(params: {
  tierId: string;
  quantity: number;
  sessionToken: string;
  ttlSeconds?: number;
}): Promise<boolean> {
  const { tierId, quantity, sessionToken, ttlSeconds = DEFAULT_TTL_SECONDS } = params;
  const redis = await getRedisClient();
  
  const lockKey = `${LOCK_NAMESPACE}:${tierId}:${sessionToken}`;
  
  // Store the lock info
  const lockInfo: LockInfo = {
    tierId,
    quantity,
    sessionToken,
    createdAt: new Date().toISOString()
  };
  
  const setResult = await redis.set(
    lockKey,
    JSON.stringify(lockInfo),
    'EX',
    ttlSeconds,
    'NX'
  );
  
  return setResult === 'OK';
}

export async function getActiveLocksForTier(tierId: string): Promise<number> {
  const redis = await getRedisClient();
  const pattern = `${LOCK_NAMESPACE}:${tierId}:*`;
  
  // Get all keys matching the pattern
  const keys = await redis.keys(pattern);
  
  let totalLocked = 0;
  
  // For each key, check if it's still valid
  for (const key of keys) {
    const rawValue = await redis.get(key);
    if (rawValue) {
      try {
        const lockInfo: LockInfo = JSON.parse(rawValue);
        totalLocked += lockInfo.quantity;
      } catch {
        // Ignore invalid JSON
      }
    }
  }
  
  return totalLocked;
}

export async function releaseLock(sessionToken: string): Promise<void> {
  const redis = await getRedisClient();
  
  // Find all keys for this session token
  const pattern = `${LOCK_NAMESPACE}:*:${sessionToken}`;
  const keys = await redis.keys(pattern);
  
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

export async function getLock(sessionToken: string): Promise<LockInfo | null> {
  const redis = await getRedisClient();
  
  const pattern = `${LOCK_NAMESPACE}:*:${sessionToken}`;
  const keys = await redis.keys(pattern);
  
  if (keys.length === 0) return null;
  
  // Get the first key (should only be one)
  const rawValue = await redis.get(keys[0]);
  if (rawValue) {
    try {
      return JSON.parse(rawValue) as LockInfo;
    } catch {
      // Ignore invalid JSON
    }
  }
  
  return null;
}

export async function cleanupExpiredLocks(): Promise<void> {
  // Redis automatically cleans up expired keys, this is just a safeguard
  // but we don't need to implement it for now
}
