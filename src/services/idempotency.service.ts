import crypto from 'crypto';
import { getRedisClient, RedisConnectionError } from './redisClient.service';
import { monitor } from '../utils/monitoring';

type IdempotencyRecord =
  | { status: 'processing'; requestHash: string; createdAt: string }
  | { status: 'completed'; requestHash: string; createdAt: string; response: { httpStatus: number; body: any } };

export type IdempotencyBeginResult =
  | { type: 'acquired'; key: string; requestHash: string }
  | { type: 'replay'; key: string; httpStatus: number; body: any }
  | { type: 'conflict'; key: string; message: string }
  | { type: 'busy'; key: string; message: string }
  | { type: 'unavailable'; message: string }; // ✅ For Redis unavailable

export function hashRequestBody(body: unknown): string {
  const payload = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function beginIdempotency(params: {
  namespace: string;
  idempotencyKey: string;
  requestHash: string;
  ttlSeconds?: number;
}): Promise<IdempotencyBeginResult> {
  const { namespace, idempotencyKey, requestHash, ttlSeconds = 60 * 30 } = params;
  const key = `idem:${namespace}:${idempotencyKey}`;

  let redis;
  try {
    redis = getRedisClient();
  } catch (error) {
    // ✅ Redis connection failed - log return 503 error
    if (error instanceof RedisConnectionError) {
      monitor.redisUnavailable('idempotency check', error.message);
      return {
        type: 'unavailable',
        message: 'Payment service temporarily unavailable. Please try again later.'
      };
    }
    throw error;
  }

  const processing: IdempotencyRecord = {
    status: 'processing',
    requestHash,
    createdAt: new Date().toISOString(),
  };

  let setResult;
  try {
    setResult = await redis.set(
      key,
      JSON.stringify(processing),
      'EX',
      ttlSeconds,
      'NX'
    );
  } catch (error) {
    // ✅ Redis operation failed - log return 503
    monitor.redisUnavailable('Redis SET operation', error instanceof Error ? error.message : 'Unknown error');
    return {
      type: 'unavailable',
      message: 'Payment service temporarily unavailable. Please try again later.'
    };
  }

  if (setResult === 'OK') {
    return { type: 'acquired', key, requestHash };
  }

  let existingRaw;
  try {
    existingRaw = await redis.get(key);
  } catch (error) {
    monitor.redisUnavailable('Redis GET operation', error instanceof Error ? error.message : 'Unknown error');
    return {
      type: 'unavailable',
      message: 'Payment service temporarily unavailable. Please try again later.'
    };
  }

  if (!existingRaw) {
    return { type: 'busy', key, message: 'Idempotency key is not available yet. Please retry.' };
  }

  let existing: IdempotencyRecord | null = null;
  try {
    existing = JSON.parse(existingRaw) as IdempotencyRecord;
  } catch {
    return { type: 'conflict', key, message: 'Idempotency key is in an invalid state.' };
  }

  if (existing.requestHash !== requestHash) {
    return { type: 'conflict', key, message: 'Idempotency key reuse with a different request payload.' };
  }

  if (existing.status === 'completed') {
    return { type: 'replay', key, httpStatus: existing.response.httpStatus, body: existing.response.body };
  }

  return { type: 'busy', key, message: 'Request with this idempotency key is still processing.' };
}

export async function completeIdempotency(params: {
  key: string;
  requestHash: string;
  httpStatus: number;
  body: any;
  ttlSeconds?: number;
}): Promise<void> {
  const { key, requestHash, httpStatus, body, ttlSeconds = 60 * 30 } = params;
  
  let redis;
  try {
    redis = getRedisClient();
  } catch (error) {
    // ✅ Redis unavailable 
    if (error instanceof RedisConnectionError) {
      monitor.redisUnavailable('idempotency completion', error.message);
    }
    return;
  }

  const completed: IdempotencyRecord = {
    status: 'completed',
    requestHash,
    createdAt: new Date().toISOString(),
    response: { httpStatus, body },
  };

  try {
    await redis.set(key, JSON.stringify(completed), 'EX', ttlSeconds);
  } catch (error) {
    monitor.redisUnavailable('idempotency completion SET', error instanceof Error ? error.message : 'Unknown error');
    
  }
}