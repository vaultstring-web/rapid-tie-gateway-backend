import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../server';
import { AppError } from '../utils/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

export class AuthController {
  /**
   * Register a new user
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, phone, password, firstName, lastName, role, businessName, organizationName } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

      if (existingUser) {
        return next(new AppError('User already exists with this email or phone', 400));
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user with role-specific data
      const user = await prisma.user.create({
        data: {
          email,
          phone,
          password: hashedPassword,
          firstName,
          lastName,
          role,
          ...(role === 'MERCHANT' && {
            merchant: {
              create: {
                businessName: businessName || 'My Business',
                status: 'PENDING',
              },
            },
          }),
          ...(role === 'ORGANIZER' && {
            organizer: {
              create: {
                organizationName: organizationName || 'My Organization',
                status: 'PENDING',
              },
            },
          }),
        },
        include: {
          merchant: true,
          organizer: true,
        },
      });

      // Generate verification token (for email verification)
      const verificationToken = crypto.randomBytes(32).toString('hex');
      if (process.env.NODE_ENV === 'development') {
        logger.info(`Verification token for ${email}: ${verificationToken}`);
      }

      // Generate authentication tokens
      const token = this.generateToken(user.id);
      const refreshToken = this.generateRefreshToken(user.id);

      // Store refresh token in session
      await prisma.session.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Set cookie with token
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            merchant: user.merchant,
            organizer: user.organizer,
          },
          token,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, phone, password } = req.body;
          await this.logActivity(null, 'LOGIN_ATTEMPT', req);    
      // Find user by email or phone
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            ...(phone ? [{ phone }] : []),
          ],
        },
        include: {
          merchant: true,
          organizer: true,
          employee: true,
          approver: true,
          financeOfficer: true,
          admin: true,
        },
      });

      // Case 1: User not found
      if (!user) {
       await this.logActivity(null, 'LOGIN_FAILED_USER_NOT_FOUND', req);
        return next(new AppError('Invalid credentials', 401));
      }

      // Case 2: Invalid password
const isValidPassword = await bcrypt.compare(password, user.password);
if (!isValidPassword) {
  await this.logActivity(user.id, 'LOGIN_FAILED', req);
 // Send response without returning it (fixes TypeScript void issue)
  res.status(401).json({
    success: false,
    message: 'Invalid credentials',
  });
  return; // stop further execution
}

      // Update last login timestamp
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const token = this.generateToken(user.id);
      const refreshToken = this.generateRefreshToken(user.id);

      // Store refresh token in session
      await prisma.session.create({
        data: {
          userId: user.id,
          token: refreshToken,
          deviceInfo: req.headers['user-agent'] as string,
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Log successful login
      await this.logActivity(user.id, 'LOGIN_SUCCESS', req);

      // Set cookie with token
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            merchant: user.merchant,
            organizer: user.organizer,
            employee: user.employee,
            approver: user.approver,
            financeOfficer: user.financeOfficer,
            admin: user.admin,
          },
          token,
          refreshToken,
        },
      });return;
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return next(new AppError('Refresh token is required', 400));
      }

      // Find valid session
      const session = await prisma.session.findFirst({
        where: {
          token: refreshToken,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });

      if (!session) {
        return next(new AppError('Invalid or expired refresh token', 401));
      }

      // Generate new tokens
      const token = this.generateToken(session.user.id);
      const newRefreshToken = this.generateRefreshToken(session.user.id);

      // Replace old session with new one
      await prisma.$transaction([
        prisma.session.delete({ where: { id: session.id } }),
        prisma.session.create({
          data: {
            userId: session.user.id,
            token: newRefreshToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      // Set new cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });

      res.json({
        success: true,
        data: { token, refreshToken: newRefreshToken },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   */
  async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.token;

      if (!token) {
        return next(new AppError('No token provided', 401));
      }

      // Delete session
      await prisma.session.deleteMany({ where: { token } });

      // Clear cookie
      res.clearCookie('token');

      // Log activity
      if (req.user) {
        await this.logActivity(req.user.id, 'LOGOUT', req);
      }

      res.json({ success: true, message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current authenticated user
   */
  async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('User not found', 401));
      }

      res.json({ success: true, data: { user: req.user } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change user password
   */
  async changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('User not found', 401));
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return next(new AppError('Current password and new password are required', 400));
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValid) {
        return next(new AppError('Current password is incorrect', 400));
      }

      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: req.user.id },
        data: { 
          password: hashedPassword, 
          passwordChangedAt: new Date() 
        },
      });

      // Log activity
      await this.logActivity(req.user.id, 'PASSWORD_CHANGE', req);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request password reset
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        return next(new AppError('Email is required', 400));
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Don't reveal if user exists for security
        await this.logActivity(null, 'FORGOT_PASSWORD_ATTEMPT', req);
        res.json({
          success: true,
          message: 'If your email is registered, you will receive a reset link',
        });
        return;
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Log token in development
      if (process.env.NODE_ENV === 'development') {
        logger.info(`Password reset token for ${email}: ${resetToken}`);
        logger.info(`Token expires at: ${resetTokenExpiry.toISOString()}`);
      }

      // TODO: Store token in database and send email
      // await prisma.user.update({
      //   where: { id: user.id },
      //   data: { resetToken, resetTokenExpiry },
      // });
      // await sendResetEmail(email, resetToken);

      res.json({
        success: true,
        message: 'If your email is registered, you will receive a reset link',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return next(new AppError('Token and password are required', 400));
      }

      if (password.length < 8) {
        return next(new AppError('Password must be at least 8 characters', 400));
      }

      if (process.env.NODE_ENV === 'development') {
        logger.info(`Resetting password with token: ${token}`);
      }

      // TODO: Verify token and update password
      // const user = await prisma.user.findFirst({
      //   where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
      // });
      // if (!user) return next(new AppError('Invalid or expired token', 400));
      // const hashedPassword = await bcrypt.hash(password, 12);
      // await prisma.user.update({
      //   where: { id: user.id },
      //   data: { password: hashedPassword, passwordChangedAt: new Date(), resetToken: null, resetTokenExpiry: null },
      // });

      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      next(error);
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Log activity to database
   */
  private async logActivity(
    userId: string | null,
    action: string,
    req: Request
  ): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action,
          entity: 'User',
          entityId: userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string,
          oldValue: Prisma.JsonNull,
          newValue: Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Don't throw error if logging fails - just log to console
      logger.error('Failed to log activity:', error);
    }
  }

  /**
   * Generate JWT access token
   */
  private generateToken(userId: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
    return jwt.sign({ id: userId }, secret, { expiresIn } as jwt.SignOptions);
  }

  /**
   * Generate JWT refresh token
   */
  private generateRefreshToken(userId: string): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
    }
    
    const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    return jwt.sign(
      { id: userId, type: 'refresh' }, 
      secret, 
      { expiresIn } as jwt.SignOptions
    );
  }
}