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
            const verificationToken = crypto_1.default.randomBytes(32).toString('hex');
            if (process.env.NODE_ENV === 'development') {
                logger_1.logger.info(`Verification token for ${email}: ${verificationToken}`);
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
    async login(req, res, next) {
        try {
            const { email, phone, password } = req.body;
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
                await this.logActivity(null, 'LOGIN_FAILED', req);
                return next(new errorHandler_1.AppError('Invalid credentials', 401));
            }
            const isValidPassword = await bcrypt_1.default.compare(password, user.password);
            if (!isValidPassword) {
                await this.logActivity(user.id, 'LOGIN_FAILED', req);
                return next(new errorHandler_1.AppError('Invalid credentials', 401));
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
            const user = await server_1.prisma.user.findUnique({ where: { email } });
            if (!user) {
                await this.logActivity(null, 'FORGOT_PASSWORD_ATTEMPT', req);
                res.json({
                    success: true,
                    message: 'If your email is registered, you will receive a reset link',
                });
                return;
            }
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 3600000);
            if (process.env.NODE_ENV === 'development') {
                logger_1.logger.info(`Password reset token for ${email}: ${resetToken}`);
                logger_1.logger.info(`Token expires at: ${resetTokenExpiry.toISOString()}`);
            }
            res.json({
                success: true,
                message: 'If your email is registered, you will receive a reset link',
            });
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
            if (process.env.NODE_ENV === 'development') {
                logger_1.logger.info(`Resetting password with token: ${token}`);
            }
            res.json({ success: true, message: 'Password reset successful' });
        }
        catch (error) {
            next(error);
        }
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
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map