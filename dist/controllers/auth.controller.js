"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
const logger_1 = require("../utils/logger");
const email_1 = require("../utils/email");
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
class AuthController {
    async register(req, res, next) {
        try {
            const { email, phone, password, firstName, lastName, role, businessName, organizationName } = req.body;
            const existingUser = await server_1.prisma.user.findFirst({
                where: {
                    OR: [
                        { email },
                        ...(phone ? [{ phone }] : []),
                    ],
                },
            });
            if (existingUser) {
                return next(new errorHandler_1.AppError('User already exists with this email or phone', 400));
            }
            const hashedPassword = await bcrypt_1.default.hash(password, 12);
            const user = await server_1.prisma.user.create({
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
            const verificationToken = crypto_1.default.randomBytes(32).toString('hex');
            try {
                await server_1.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        ...(verificationToken && { verificationToken }),
                        ...(verificationToken && {
                            verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                        }),
                    },
                });
            }
            catch (err) {
                logger_1.logger.warn('Failed to store verification token');
            }
            try {
                await (0, email_1.sendVerificationEmail)(email, verificationToken);
                logger_1.logger.info(`Verification token for ${email}: ${verificationToken}`);
            }
            catch (err) {
                logger_1.logger.error('Failed to send verification email:', err);
            }
            const token = this.generateToken(user.id);
            const refreshToken = this.generateRefreshToken(user.id);
            await server_1.prisma.session.create({
                data: {
                    userId: user.id,
                    token: refreshToken,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 15 * 60 * 1000,
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
        }
        catch (error) {
            next(error);
        }
    }
    async verifyEmail(req, res, next) {
        try {
            const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
            const bodyToken = typeof req.body?.token === 'string' ? req.body.token : undefined;
            const bodyCode = typeof req.body?.code === 'string' ? req.body.code : undefined;
            const token = queryToken || bodyToken || bodyCode;
            if (!token) {
                return next(new errorHandler_1.AppError('Invalid verification token', 400));
            }
            const user = await server_1.prisma.user.findFirst({
                where: {
                    verificationToken: token,
                    verificationTokenExpiry: {
                        gt: new Date(),
                    },
                },
            });
            if (!user) {
                return next(new errorHandler_1.AppError('Invalid or expired token', 400));
            }
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    emailVerified: true,
                    verificationToken: null,
                    verificationTokenExpiry: null,
                },
            });
            await this.logActivity(user.id, 'EMAIL_VERIFIED', req);
            res.json({
                success: true,
                message: 'Email verified successfully',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async validateResetToken(req, res, next) {
        try {
            const token = typeof req.query.token === 'string' ? req.query.token : undefined;
            if (!token) {
                return next(new errorHandler_1.AppError('Token is required', 400));
            }
            const user = await server_1.prisma.user.findFirst({
                where: {
                    resetToken: token,
                    resetTokenExpiry: { gt: new Date() },
                },
                select: { id: true },
            });
            res.json({
                success: true,
                valid: Boolean(user),
            });
        }
        catch (error) {
            next(error);
        }
    }
    async login(req, res, next) {
        try {
            const { email, phone, password } = req.body;
            await this.logActivity(null, 'LOGIN_ATTEMPT', req);
            const user = await server_1.prisma.user.findFirst({
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
                return next(new errorHandler_1.AppError('Invalid credentials', 401));
            }
            const isValidPassword = await bcrypt_1.default.compare(password, user.password);
            if (!isValidPassword) {
                await this.logActivity(user.id, 'LOGIN_FAILED', req);
                res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
                return;
            }
            if (!user.emailVerified) {
                return next(new errorHandler_1.AppError('Please verify your email first', 403));
            }
            if (user.twoFactorEnabled) {
                res.status(200).json({
                    success: true,
                    requires2FA: true,
                    message: '2FA code required',
                    userId: user.id,
                });
                return;
            }
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
            const token = this.generateToken(user.id);
            const refreshToken = this.generateRefreshToken(user.id);
            await server_1.prisma.session.create({
                data: {
                    userId: user.id,
                    token: refreshToken,
                    deviceInfo: req.headers['user-agent'],
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
        }
        catch (error) {
            next(error);
        }
    }
    async setup2FA(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('User not found', 401));
            }
            const secret = speakeasy_1.default.generateSecret({
                name: `RapidTie (${req.user.email})`,
            });
            await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: {
                    twoFactorSecret: secret.base32,
                },
            });
            const qrCode = await qrcode_1.default.toDataURL(secret.otpauth_url);
            const backupCodes = Array.from({ length: 8 }, () => crypto_1.default.randomBytes(4).toString('hex'));
            await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: { twoFactorBackupCodes: backupCodes },
            });
            res.json({
                success: true,
                data: {
                    qrCode,
                    secret: secret.base32,
                    backupCodes,
                    otpauthUrl: secret.otpauth_url,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async get2FAStatus(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    twoFactorEnabled: true,
                    twoFactorSecret: true,
                    twoFactorBackupCodes: true,
                    trustedDevices: true,
                },
            });
            if (!user) {
                return next(new errorHandler_1.AppError('User not found', 404));
            }
            res.json({
                success: true,
                data: {
                    enabled: user.twoFactorEnabled,
                    verified: Boolean(user.twoFactorSecret),
                    backupCodesRemaining: user.twoFactorBackupCodes?.length || 0,
                    trustedDevices: Array.isArray(user.trustedDevices) ? user.trustedDevices : [],
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async enable2FA(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const code = req.body?.code;
            if (!code) {
                return next(new errorHandler_1.AppError('Verification code is required', 400));
            }
            const user = await server_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user || !user.twoFactorSecret) {
                return next(new errorHandler_1.AppError('2FA setup required first', 400));
            }
            const isValid = speakeasy_1.default.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: code,
                window: 1,
            });
            if (!isValid) {
                return next(new errorHandler_1.AppError('Invalid verification code', 400));
            }
            const backupCodes = user.twoFactorBackupCodes?.length
                ? user.twoFactorBackupCodes
                : Array.from({ length: 8 }, () => crypto_1.default.randomBytes(4).toString('hex'));
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    twoFactorEnabled: true,
                    twoFactorBackupCodes: backupCodes,
                },
            });
            res.json({ success: true, data: { backupCodes } });
        }
        catch (error) {
            next(error);
        }
    }
    async disable2FA(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const { password } = req.body;
            if (!password) {
                return next(new errorHandler_1.AppError('Password is required', 400));
            }
            const user = await server_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user) {
                return next(new errorHandler_1.AppError('User not found', 404));
            }
            const valid = await bcrypt_1.default.compare(password, user.password);
            if (!valid) {
                return next(new errorHandler_1.AppError('Invalid password', 400));
            }
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    twoFactorEnabled: false,
                    twoFactorSecret: null,
                    twoFactorBackupCodes: [],
                    trustedDevices: client_1.Prisma.JsonNull,
                },
            });
            res.json({ success: true, message: '2FA disabled successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    async verify2FA(req, res, next) {
        try {
            const { userId } = req.body;
            const token = req.body?.token || req.body?.code;
            if (!userId || !token) {
                return next(new errorHandler_1.AppError('UserId and token are required', 400));
            }
            const user = await server_1.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || !user.twoFactorSecret) {
                return next(new errorHandler_1.AppError('Invalid user or 2FA not setup', 400));
            }
            const isValid = speakeasy_1.default.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token,
                window: 1,
            });
            if (!isValid) {
                return next(new errorHandler_1.AppError('Invalid 2FA code', 400));
            }
            if (!user.twoFactorEnabled) {
                await server_1.prisma.user.update({
                    where: { id: user.id },
                    data: { twoFactorEnabled: true },
                });
                res.json({
                    success: true,
                    message: '2FA enabled successfully',
                });
                return;
            }
            const accessToken = this.generateToken(user.id);
            const refreshToken = this.generateRefreshToken(user.id);
            await server_1.prisma.session.create({
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
        }
        catch (error) {
            next(error);
        }
    }
    async refreshToken(req, res, next) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return next(new errorHandler_1.AppError('Refresh token is required', 400));
            }
            const session = await server_1.prisma.session.findFirst({
                where: {
                    token: refreshToken,
                    expiresAt: { gt: new Date() },
                },
                include: { user: true },
            });
            if (!session) {
                return next(new errorHandler_1.AppError('Invalid or expired refresh token', 401));
            }
            const token = this.generateToken(session.user.id);
            const newRefreshToken = this.generateRefreshToken(session.user.id);
            await server_1.prisma.$transaction([
                server_1.prisma.session.delete({ where: { id: session.id } }),
                server_1.prisma.session.create({
                    data: {
                        userId: session.user.id,
                        token: newRefreshToken,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                }),
            ]);
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
        }
        catch (error) {
            next(error);
        }
    }
    async logout(req, res, next) {
        try {
            const token = req.token;
            if (!token) {
                return next(new errorHandler_1.AppError('No token provided', 401));
            }
            await server_1.prisma.session.deleteMany({ where: { token } });
            res.clearCookie('token');
            if (req.user) {
                await this.logActivity(req.user.id, 'LOGOUT', req);
            }
            res.json({ success: true, message: 'Logout successful' });
        }
        catch (error) {
            next(error);
        }
    }
    async me(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('User not found', 401));
            }
            res.json({ success: true, data: { user: req.user } });
        }
        catch (error) {
            next(error);
        }
    }
    async changePassword(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('User not found', 401));
            }
            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword) {
                return next(new errorHandler_1.AppError('Current password and new password are required', 400));
            }
            const isValid = await bcrypt_1.default.compare(currentPassword, req.user.password);
            if (!isValid) {
                return next(new errorHandler_1.AppError('Current password is incorrect', 400));
            }
            const hashedPassword = await bcrypt_1.default.hash(newPassword, 12);
            await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: {
                    password: hashedPassword,
                    passwordChangedAt: new Date()
                },
            });
            await this.logActivity(req.user.id, 'PASSWORD_CHANGE', req);
            res.json({ success: true, message: 'Password changed successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            if (!email) {
                return next(new errorHandler_1.AppError('Email is required', 400));
            }
            const user = await server_1.prisma.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                }
            });
            await this.logActivity(user?.id || null, 'FORGOT_PASSWORD_ATTEMPT', req);
            const message = 'If your email is registered, you will receive a reset link';
            if (!user) {
                res.json({ success: true, message });
                return;
            }
            const recentReset = await server_1.prisma.user.findFirst({
                where: {
                    id: user.id,
                    resetTokenExpiry: {
                        gt: new Date(Date.now() - 5 * 60 * 1000),
                    },
                },
            });
            if (recentReset?.resetTokenExpiry) {
                logger_1.logger.warn(`Rate limit hit for password reset: ${email}`);
                res.json({ success: true, message });
                return;
            }
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    resetToken,
                    resetTokenExpiry,
                },
            });
            try {
                await (0, email_1.sendVerificationEmail)(user.email, resetToken, 'RESET', user.firstName || undefined);
                logger_1.logger.info(`Password reset email sent to ${user.email}`);
            }
            catch (emailError) {
                logger_1.logger.error('Failed to send reset email:', emailError);
                if (process.env.NODE_ENV === 'development') {
                    console.log(`\n⚠️ Email sending failed. Reset token for ${user.email}: ${resetToken}\n`);
                }
            }
            res.json({ success: true, message });
        }
        catch (error) {
            next(error);
        }
    }
    async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;
            if (!token || !password) {
                return next(new errorHandler_1.AppError('Token and password are required', 400));
            }
            if (password.length < 8) {
                return next(new errorHandler_1.AppError('Password must be at least 8 characters', 400));
            }
            const passwordValidation = this.validatePasswordStrength(password);
            if (!passwordValidation.isValid) {
                return next(new errorHandler_1.AppError(passwordValidation.message, 400));
            }
            const user = await server_1.prisma.user.findFirst({
                where: {
                    resetToken: token,
                    resetTokenExpiry: {
                        gt: new Date(),
                    },
                },
            });
            if (!user) {
                await this.logActivity(null, 'PASSWORD_RESET_FAILED_INVALID_TOKEN', req);
                return next(new errorHandler_1.AppError('Invalid or expired reset token', 400));
            }
            if (user.passwordResetAt &&
                user.passwordResetAt > new Date(Date.now() - 5 * 60 * 1000)) {
                await this.logActivity(user.id, 'PASSWORD_RESET_RAPID_ATTEMPT', req);
                return next(new errorHandler_1.AppError('Please wait before trying again', 429));
            }
            const hashedPassword = await bcrypt_1.default.hash(password, 12);
            await server_1.prisma.$transaction(async (tx) => {
                await tx.user.update({
                    where: { id: user.id },
                    data: {
                        password: hashedPassword,
                        passwordChangedAt: new Date(),
                        passwordResetAt: new Date(),
                        resetToken: null,
                        resetTokenExpiry: null,
                    },
                });
                await tx.session.deleteMany({
                    where: { userId: user.id },
                });
                await tx.activityLog.create({
                    data: {
                        userId: user.id,
                        action: 'PASSWORD_RESET_SUCCESS',
                        entity: 'User',
                        entityId: user.id,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                        newValue: { timestamp: new Date().toISOString() },
                    },
                });
            });
            try {
                await (0, email_1.sendVerificationEmail)(user.email, '', 'RESET_CONFIRMATION', user.firstName || undefined);
            }
            catch (emailError) {
                logger_1.logger.error('Failed to send reset confirmation email:', emailError);
            }
            logger_1.logger.info(`Password reset successful for user: ${user.email} | UserId: ${user.id} | IP: ${req.ip}`);
            res.json({
                success: true,
                message: 'Password reset successful. Please login with your new password.'
            });
        }
        catch (error) {
            next(error);
        }
    }
    validatePasswordStrength(password) {
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
    async logActivity(userId, action, req) {
        try {
            await server_1.prisma.activityLog.create({
                data: {
                    userId,
                    action,
                    entity: 'User',
                    entityId: userId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    oldValue: client_1.Prisma.JsonNull,
                    newValue: client_1.Prisma.JsonNull,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to log activity:', error);
        }
    }
    generateToken(userId) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }
        const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
        return jsonwebtoken_1.default.sign({ id: userId }, secret, { expiresIn });
    }
    generateRefreshToken(userId) {
        const secret = process.env.JWT_REFRESH_SECRET;
        if (!secret) {
            throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
        }
        const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
        return jsonwebtoken_1.default.sign({ id: userId, type: 'refresh' }, secret, { expiresIn });
    }
    async resendVerification(req, res, next) {
        try {
            const { email } = req.body;
            if (!email) {
                return next(new errorHandler_1.AppError('Email is required', 400));
            }
            const user = await server_1.prisma.user.findUnique({
                where: { email },
            });
            if (!user) {
                return next(new errorHandler_1.AppError('User not found', 404));
            }
            if (user.emailVerified) {
                return next(new errorHandler_1.AppError('Email already verified', 400));
            }
            const verificationToken = crypto_1.default.randomBytes(32).toString('hex');
            const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    verificationToken,
                    verificationTokenExpiry,
                },
            });
            await (0, email_1.sendVerificationEmail)(user.email, verificationToken, 'VERIFICATION', user.firstName || undefined);
            res.json({
                success: true,
                message: 'Verification email sent successfully',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async verify2FABackupCode(req, res, next) {
        try {
            const { userId, backupCode } = req.body;
            if (!userId || !backupCode) {
                return next(new errorHandler_1.AppError('userId and backupCode are required', 400));
            }
            const user = await server_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !user.twoFactorEnabled) {
                return next(new errorHandler_1.AppError('Invalid user', 400));
            }
            const exists = (user.twoFactorBackupCodes || []).includes(backupCode);
            if (!exists) {
                return next(new errorHandler_1.AppError('Invalid backup code', 400));
            }
            const remaining = (user.twoFactorBackupCodes || []).filter((code) => code !== backupCode);
            await server_1.prisma.user.update({
                where: { id: user.id },
                data: { twoFactorBackupCodes: remaining },
            });
            const accessToken = this.generateToken(user.id);
            const refreshToken = this.generateRefreshToken(user.id);
            await server_1.prisma.session.create({
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
            res.json({ success: true, data: { token: accessToken, refreshToken } });
        }
        catch (error) {
            next(error);
        }
    }
    async getTrustedDevices(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { trustedDevices: true },
            });
            res.json({
                success: true,
                data: Array.isArray(user?.trustedDevices) ? user.trustedDevices : [],
            });
        }
        catch (error) {
            next(error);
        }
    }
    async revokeTrustedDevice(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const deviceId = req.params.deviceId;
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { trustedDevices: true },
            });
            const devices = Array.isArray(user?.trustedDevices) ? user.trustedDevices : [];
            const updated = devices.filter((device) => device?.id !== deviceId);
            await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: { trustedDevices: updated },
            });
            res.json({ success: true, message: 'Trusted device revoked' });
        }
        catch (error) {
            next(error);
        }
    }
    async regenerateBackupCodes(req, res, next) {
        try {
            if (!req.user) {
                return next(new errorHandler_1.AppError('Authentication required', 401));
            }
            const codes = Array.from({ length: 8 }, () => crypto_1.default.randomBytes(4).toString('hex'));
            await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: { twoFactorBackupCodes: codes },
            });
            res.json({ success: true, data: { codes } });
        }
        catch (error) {
            next(error);
        }
    }
    async request2FARecovery(req, res) {
        const { method, contact } = req.body || {};
        logger_1.logger.info(`2FA recovery requested via ${method || 'unknown'} for ${contact || 'unknown-contact'}`);
        res.json({
            success: true,
            message: 'If the account exists, a recovery message has been sent.',
        });
    }
    async verify2FARecovery(req, res) {
        const { token } = req.body || {};
        if (!token) {
            res.status(400).json({ success: false, message: 'Recovery token is required' });
            return;
        }
        res.json({ success: true, message: 'Recovery verified' });
    }
    async getProfile(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                include: {
                    merchant: true,
                    organizer: true,
                    employee: {
                        include: {
                            organization: { select: { id: true, name: true } },
                            department: { select: { id: true, name: true } },
                        },
                    },
                    approver: {
                        include: { organization: { select: { id: true, name: true } } },
                    },
                    financeOfficer: {
                        include: { organization: { select: { id: true, name: true } } },
                    },
                    admin: true,
                },
            });
            if (!user)
                return next(new errorHandler_1.AppError('User not found', 404));
            const { password, twoFactorSecret, twoFactorBackupCodes, verificationToken, verificationTokenExpiry, resetToken, resetTokenExpiry, ...safeUser } = user;
            res.json({ success: true, data: { user: safeUser } });
        }
        catch (error) {
            next(error);
        }
    }
    async updateProfile(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { firstName, lastName, phone, profileImage } = req.body;
            if (phone && phone !== req.user.phone) {
                const taken = await server_1.prisma.user.findFirst({
                    where: { phone, NOT: { id: req.user.id } },
                });
                if (taken)
                    return next(new errorHandler_1.AppError('Phone number already in use', 409));
            }
            const updated = await server_1.prisma.user.update({
                where: { id: req.user.id },
                data: {
                    ...(firstName !== undefined && { firstName }),
                    ...(lastName !== undefined && { lastName }),
                    ...(phone !== undefined && { phone }),
                    ...(profileImage !== undefined && { profileImage }),
                },
                select: {
                    id: true, email: true, phone: true, firstName: true,
                    lastName: true, role: true, profileImage: true,
                    emailVerified: true, updatedAt: true,
                },
            });
            await this.logActivity(req.user.id, 'PROFILE_UPDATE', req);
            res.json({ success: true, data: { user: updated } });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map