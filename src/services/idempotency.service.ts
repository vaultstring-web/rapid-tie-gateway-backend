import crypto from 'crypto';
import { getRedisClient } from './redisClient.service';

type IdempotencyRecord =
  | { status: 'processing'; requestHash: string; createdAt: string }
  | { status: 'completed'; requestHash: string; createdAt: string; response: { httpStatus: number; body: any } };

export type IdempotencyBeginResult =
  | { type: 'acquired'; key: string; requestHash: string }
  | { type: 'replay'; key: string; httpStatus: number; body: any }
  | { type: 'conflict'; key: string; message: string }
  | { type: 'busy'; key: string; message: string };

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

  const redis = await getRedisClient();

  const processing: IdempotencyRecord = {
    status: 'processing',
    requestHash,
    createdAt: new Date().toISOString(),
  };

  const setResult = await redis.set(key, JSON.stringify(processing), {
    NX: true,
    EX: ttlSeconds,
  });

  if (setResult === 'OK') {
    return { type: 'acquired', key, requestHash };
  }

  const existingRaw = await redis.get(key);
  if (!existingRaw) {
    // Key expired between checks; let caller retry once.
    return { type: 'busy', key, message: 'Idempotency key is not available yet. Please retry.' };
  }

  let existing: IdempotencyRecord | null = null;
  try {
    existing = JSON.parse(existingRaw) as IdempotencyRecord;
  } catch {
    // Corrupted value; fail closed.
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
  const redis = await getRedisClient();

  const completed: IdempotencyRecord = {
    status: 'completed',
    requestHash,
    createdAt: new Date().toISOString(),
    response: { httpStatus, body },
  };

  await redis.set(key, JSON.stringify(completed), { EX: ttlSeconds });
}

