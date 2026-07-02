// src/middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    message: 'Too many password reset requests. Try again after 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated payment initiation rate limiter
export const paymentInitiateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    if (userId) {
      return `payment:user:${userId}`;
    }
    const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    return `payment:ip:${ip}`;
  },
  message: {
    success: false,
    message: 'Too many payment initiation attempts. Please wait a moment before trying again.',
    error: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '60 seconds',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
});