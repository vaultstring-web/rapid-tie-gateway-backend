import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../server';
import { AppError } from '../utils/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { sendVerificationEmail } from '../utils/email';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
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

    // Create user
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
              status: 'ACTIVE',
            },
          },
        }),
        ...(role === 'ORGANIZER' && {
          organizer: {
            create: {
              organizationName: organizationName || 'My Organization',
              status: 'ACTIVE',
            },
          },
        }),
      },
      include: {
        merchant: true,
        organizer: true,
      },
    });

    // ==================== ✅ NEW ADDITIONS ====================

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

try {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(verificationToken && { verificationToken }),
      ...(verificationToken && {
        verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    } as any, 
  });
    } catch (err) {
      logger.warn('Failed to store verification token');
    }

    // Send email OR fallback to log
    try {
      // If you have email utility later, plug it here
      await sendVerificationEmail(email, verificationToken);

      logger.info(`Verification token for ${email}: ${verificationToken}`);
    } catch (err) {
      logger.error('Failed to send verification email:', err);
    }

    // ==================== END ADDITIONS ====================

    // Generate tokens (UNCHANGED)
    const token = this.generateToken(user.id);
    const refreshToken = this.generateRefreshToken(user.id);

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    // Response (UNCHANGED)
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
async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return next(new AppError('Invalid verification token', 400));
    }

    // 🔍 Find user with matching token AND valid expiry
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpiry: {
          gt: new Date(), // token not expired
        },
      },
    });

    if (!user) {
      return next(new AppError('Invalid or expired token', 400));
    }

    // ✅ Mark user as verified + clean up token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    // (Optional but good) log activity
    await this.logActivity(user.id, 'EMAIL_VERIFIED', req);

    res.json({
      success: true,
      message: 'Email verified successfully',
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

    if (!user) {
      await this.logActivity(null, 'LOGIN_FAILED_USER_NOT_FOUND', req);
      return next(new AppError('Invalid credentials', 401));
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await this.logActivity(user.id, 'LOGIN_FAILED', req);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
      return;
    }

    if (!user.emailVerified) {
      return next(new AppError('Please verify your email first', 403));
    }

    // ✅ 🔐 2FA CHECK (IMPORTANT FIX)
    if (user.twoFactorEnabled) {
      res.status(200).json({
        success: true,
        requires2FA: true,
        message: '2FA code required',
        userId: user.id,
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.generateToken(user.id);
    const refreshToken = this.generateRefreshToken(user.id);

    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        deviceInfo: req.headers['user-agent'] as string,
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.logActivity(user.id, 'LOGIN_SUCCESS', req);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token,
        refreshToken,
      },
    });

  } catch (error) {
    next(error);
  }
}
async setup2FA(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('User not found', 401));
    }

    const secret = speakeasy.generateSecret({
      name: `RapidTie (${req.user.email})`,
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorSecret: secret.base32,
      },
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    res.json({
      success: true,
      data: {
        qrCode,
        secret: secret.base32,
      },
    });

  } catch (error) {
    next(error);
  }
}

async verify2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return next(new AppError('UserId and token are required', 400));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret) {
      return next(new AppError('Invalid user or 2FA not setup', 400));
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!isValid) {
      return next(new AppError('Invalid 2FA code', 400));
    }

    // ✅ ENABLE 2FA if first time
    if (!user.twoFactorEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
      });

      res.json({
        success: true,
        message: '2FA enabled successfully',
      });
      return;
    }

    // ✅ COMPLETE LOGIN AFTER 2FA
    const accessToken = this.generateToken(user.id);
    const refreshToken = this.generateRefreshToken(user.id);

    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    res.json({
      success: true,
      message: '2FA login successful',
      data: {
        token: accessToken,
        refreshToken,
      },
    });

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

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
        }
      });

      // Log attempt
      await this.logActivity(user?.id || null, 'FORGOT_PASSWORD_ATTEMPT', req);

      // Always return same message for security
      const message = 'If your email is registered, you will receive a reset link';

      if (!user) {
        res.json({ success: true, message });
        return;
      }

      // Check for rate limiting - prevent multiple requests in short time
      const recentReset = await prisma.user.findFirst({
        where: {
          id: user.id,
          resetTokenExpiry: {
            gt: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
          },
        } as Prisma.UserWhereInput,
      });

      if (recentReset?.resetTokenExpiry) {
        logger.warn(`Rate limit hit for password reset: ${email}`);
        res.json({ success: true, message });
        return;
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        } as Prisma.UserUpdateInput,
      });

      // Send reset email
      try {
        await sendVerificationEmail(user.email, resetToken, 'RESET', user.firstName || undefined);
        logger.info(`Password reset email sent to ${user.email}`);
      } catch (emailError) {
        logger.error('Failed to send reset email:', emailError);
        
        // In development, still show the token in logs
        if (process.env.NODE_ENV === 'development') {
          console.log(`\n⚠️ Email sending failed. Reset token for ${user.email}: ${resetToken}\n`);
        }
      }

      res.json({ success: true, message });

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

      // Validation
      if (!token || !password) {
        return next(new AppError('Token and password are required', 400));
      }

      if (password.length < 8) {
        return next(new AppError('Password must be at least 8 characters', 400));
      }

      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return next(new AppError(passwordValidation.message, 400));
      }

      // Find user with valid token
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: {
            gt: new Date(), // Token not expired
          },
        } as Prisma.UserWhereInput,
      });

      if (!user) {
        await this.logActivity(null, 'PASSWORD_RESET_FAILED_INVALID_TOKEN', req);
        return next(new AppError('Invalid or expired reset token', 400));
      }

      // Prevent multiple rapid resets
      if (user.passwordResetAt && 
          user.passwordResetAt > new Date(Date.now() - 5 * 60 * 1000)) {
        await this.logActivity(user.id, 'PASSWORD_RESET_RAPID_ATTEMPT', req);
        return next(new AppError('Please wait before trying again', 429));
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Use transaction to ensure data consistency
      await prisma.$transaction(async (tx) => {
        // Update user password and clear reset token
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            passwordChangedAt: new Date(),
            passwordResetAt: new Date(),
            resetToken: null,
            resetTokenExpiry: null,
          } as Prisma.UserUpdateInput,
        });

        // Invalidate all existing sessions for security
        await tx.session.deleteMany({
          where: { userId: user.id },
        });

        // Log the successful reset
        await tx.activityLog.create({
          data: {
            userId: user.id,
            action: 'PASSWORD_RESET_SUCCESS',
            entity: 'User',
            entityId: user.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] as string,
            newValue: { timestamp: new Date().toISOString() } as any,
          },
        });
      });

      // Send confirmation email (optional, don't block on failure)
      try {
        await sendVerificationEmail(user.email, '', 'RESET_CONFIRMATION', user.firstName || undefined);
      } catch (emailError) {
        logger.error('Failed to send reset confirmation email:', emailError);
      }

      logger.info(`Password reset successful for user: ${user.email} | UserId: ${user.id} | IP: ${req.ip}`);
      
      res.json({
        success: true,
        message: 'Password reset successful. Please login with your new password.'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): { isValid: boolean; message: string } {
    const checks = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[^a-zA-Z0-9]/.test(password),
    };

    if (!checks.minLength) {
      return { isValid: false, message: 'Password must be at least 8 characters' };
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    
    if (passedChecks < 3) {
      return { 
        isValid: false, 
        message: 'Password must contain at least 3 of the following: uppercase letters, lowercase letters, numbers, special characters' 
      };
    }

    return { isValid: true, message: '' };
  }

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
  /**
 * Resend verification email
 */
async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new AppError('Email is required', 400));
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (user.emailVerified) {
      return next(new AppError('Email already verified', 400));
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpiry,
      },
    });

    // Send verification email
    await sendVerificationEmail(user.email, verificationToken, 'VERIFICATION', user.firstName || undefined);

    res.json({
      success: true,
      message: 'Verification email sent successfully',
    });

  } catch (error) {
    next(error);
  }
}
  // ==================== HELPER METHODS ====================

  /**
   * Log activity to database
   */
}