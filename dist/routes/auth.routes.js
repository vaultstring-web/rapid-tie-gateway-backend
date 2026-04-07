"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middlewares/auth");
const rateLimiter_1 = require("../middlewares/rateLimiter");
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
router.post('/login', rateLimiter_1.loginRateLimiter, async (req, res, next) => {
    try {
        await authController.login(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
router.post('/forgot-password', async (req, res, next) => {
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
router.get('/test', (_req, res) => {
    res.json({
        success: true,
        message: 'Auth route working!',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map