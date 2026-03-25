// src/middlewares/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';
import { AppError } from '../utils/errorHandler';

// Define and EXPORT the type
export type UserWithRelations = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string | null;
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

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
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