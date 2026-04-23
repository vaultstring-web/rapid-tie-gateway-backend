"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middlewares/auth");
const rateLimiter_1 = require("../middlewares/rateLimiter");
const server_1 = require("../server");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const authController = new auth_controller_1.AuthController();
router.post('/register', async (req, res, next) => {
    try {
        await authController.register(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/verify-email', async (req, res, next) => {
    try {
        await authController.verifyEmail(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/login', rateLimiter_1.loginRateLimiter, async (req, res, next) => {
    try {
        await authController.login(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/forgot-password', rateLimiter_1.forgotPasswordLimiter, async (req, res, next) => {
    try {
        await authController.forgotPassword(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/reset-password', async (req, res, next) => {
    try {
        await authController.resetPassword(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/refresh-token', async (req, res, next) => {
    try {
        await authController.refreshToken(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/logout', auth_1.authenticate, async (req, res, next) => {
    try {
        await authController.logout(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.get('/me', auth_1.authenticate, async (req, res, next) => {
    try {
        await authController.me(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/change-password', auth_1.authenticate, async (req, res, next) => {
    try {
        await authController.changePassword(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.get('/profile', auth_1.authenticate, async (req, res, next) => {
    try {
        await authController.getProfile(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.put('/profile', auth_1.authenticate, async (req, res, next) => {
    try {
        await authController.updateProfile(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.get('/test', (_req, res) => {
    res.json({
        success: true,
        message: 'Auth route working!',
        timestamp: new Date().toISOString()
    });
});
router.get('/status', async (req, res) => {
    try {
        const token = req.cookies?.token ||
            req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.json({
                success: true,
                authenticated: false,
                status: 'ok'
            });
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            const user = await server_1.prisma.user.findUnique({
                where: { id: decoded.id },
                include: {
                    merchant: true,
                    organizer: true,
                }
            });
            return res.json({
                success: true,
                authenticated: !!user,
                user: user || null
            });
        }
        catch (err) {
            return res.json({
                success: true,
                authenticated: false,
                status: 'ok'
            });
        }
    }
    catch (error) {
        return res.json({
            success: true,
            authenticated: false,
            status: 'ok'
        });
    }
});
router.get('/verify', authController.verifyEmail.bind(authController));
router.post('/resend-verification', authController.resendVerification);
router.get('/status', (_req, res) => {
    res.json({ success: true, message: 'Auth service is running' });
});
router.get('/validate-reset-token', authController.validateResetToken.bind(authController));
router.get('/2fa/status', auth_1.authenticate, authController.get2FAStatus.bind(authController));
router.post('/2fa/setup', auth_1.authenticate, authController.setup2FA.bind(authController));
router.post('/2fa/enable', auth_1.authenticate, authController.enable2FA.bind(authController));
router.post('/2fa/disable', auth_1.authenticate, authController.disable2FA.bind(authController));
router.post('/2fa/verify', authController.verify2FA.bind(authController));
router.post('/2fa/backup-code', authController.verify2FABackupCode.bind(authController));
router.get('/2fa/devices', auth_1.authenticate, authController.getTrustedDevices.bind(authController));
router.delete('/2fa/devices/:deviceId', auth_1.authenticate, authController.revokeTrustedDevice.bind(authController));
router.post('/2fa/backup-codes/regenerate', auth_1.authenticate, authController.regenerateBackupCodes.bind(authController));
router.post('/2fa/recovery/request', authController.request2FARecovery.bind(authController));
router.post('/2fa/recovery/verify', authController.verify2FARecovery.bind(authController));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map