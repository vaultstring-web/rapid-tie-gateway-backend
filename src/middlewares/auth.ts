// src/middlewares/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';
import { AppError } from '../utils/errorHandler';
import { getRedisClient } from '../services/redisClient.service';

// Define and EXPORT the type
export type UserWithRelations = {
  id: string;
  email: string;
  // password is intentionally omitted — never expose the hash on req.user
  firstName: string;
  lastName: string;
  role: string;
  phone?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  merchant?: any;
  organizer?: any;
  employee?: any;
  approver?: any;
  financeOfficer?: any;
  admin?: any;
};

// EXPORT the interface
export interface AuthRequest extends Request {
  user?: UserWithRelations;
  token?: string;
}

// Helper to exclude password from user object
export const excludePassword = (user: any): any => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

// Helper to get cache key
const getUserCacheKey = (userId: string): string => {
  return `user:${userId}`;
};

// EXPORT the functions
export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new AppError('Authentication required', 401));
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    const decoded = jwt.verify(token, jwtSecret) as { id: string };
    const userId = decoded.id;
    const cacheKey = getUserCacheKey(userId);

    let user: any = null;

    // Try to get user from Redis cache
    try {
      const redisClient = getRedisClient();
      const cachedUser = await redisClient.get(cacheKey);
      
      if (cachedUser) {
        user = JSON.parse(cachedUser);
        console.log(`✅ Cache hit for user: ${userId}`);
      }
    } catch (redisError) {
      console.error('Redis cache error:', redisError);
    }

    // If not in cache, fetch from database
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          merchant: true,
          organizer: true,
          employee: true,
          approver: true,
          financeOfficer: true,
          admin: true,
        },
      });

      if (!user) {
        return next(new AppError('User not found', 401));
      }

      // Cache the user object (without password) for 60 seconds
      try {
        const redisClient = getRedisClient();
        const userToCache = excludePassword(user);
        await redisClient.setex(cacheKey, 60, JSON.stringify(userToCache));
        console.log(`📦 Cached user: ${userId} for 60 seconds`);
      } catch (redisError) {
        // Redis error - log but don't fail the request
        console.error('Redis cache set error:', redisError);
      }
    }

    req.user = user as UserWithRelations;
    req.token = token;
    next();
  } catch (error) {
    next(new AppError('Invalid or expired token', 401));
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const userRole = req.user.role?.toLowerCase?.() || req.user.role;
    const hasRole = roles.some(role => 
      role.toLowerCase() === userRole?.toLowerCase?.() || role === userRole
    );

    if (!hasRole) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Helper function to invalidate user cache on logout
export const invalidateUserCache = async (userId: string): Promise<void> => {
  try {
    const redisClient = getRedisClient();
    const cacheKey = getUserCacheKey(userId);
    await redisClient.del(cacheKey);
    console.log(`🗑️ Cache invalidated for user: ${userId}`);
  } catch (redisError) {
    console.error('Redis cache invalidation error:', redisError);
  }
};