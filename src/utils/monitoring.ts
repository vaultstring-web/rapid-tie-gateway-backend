import { logger } from './logger';

export const monitor = {
  redisConnectionFailed: (attempts: number, error: string) => {
    const message = `Redis connection failed after ${attempts} attempts: ${error}`;
    console.error(`🔴 MONITOR: ${message}`);
    logger.error(message, { attempts, error });
  },

  redisUnavailable: (operation: string, error: string) => {
    const message = `Redis unavailable for ${operation}: ${error}`;
    console.warn(`⚠️ MONITOR: ${message}`);
    logger.warn(message);
  },

  idempotencyFallback: (key: string, reason: string) => {
    const message = `Idempotency bypassed for ${key}: ${reason}`;
    console.warn(`⚠️ MONITOR: ${message}`);
    logger.warn(message);
  }
};