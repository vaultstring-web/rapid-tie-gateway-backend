import { Router, Request, Response, NextFunction } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { forgotPasswordLimiter, loginRateLimiter } from '../middlewares/rateLimiter'; 
import { prisma } from '../server';
import jwt from 'jsonwebtoken';

// Explicitly type the router
const router: Router = Router();

const authController = new AuthController();

// Public routes
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.register(req, res, next);
  } catch (error) {
    next(error);
  }
});
router.post('/verify-email', async (req, res, next) => {
  try {
    await authController.verifyEmail(req, res, next);
  } catch (error) {
    next(error);
  }
});
router.post(
  '/login',
  loginRateLimiter, // 👈 added here
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.login(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/forgot-password', 
  forgotPasswordLimiter, // 👈 added here
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.forgotPassword(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', 
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.resetPassword(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Token refresh route
router.post('/refresh-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.refreshToken(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Protected routes
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.logout(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.me(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.changePassword(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Profile routes (any authenticated role)
router.get('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.getProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.updateProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Test route
router.get('/test', (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Auth route working!',
    timestamp: new Date().toISOString()
  });
});
router.get('/status', async (req: any, res) => {
  try {
    const token =
      req.cookies?.token ||
      req.headers.authorization?.split(' ')[1];

    // No token → health check
    if (!token) {
      return res.json({
        success: true,
        authenticated: false,
        status: 'ok'
      });
    }

    try {
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);

      const user = await prisma.user.findUnique({
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

    } catch (err) {
      return res.json({
        success: true,
        authenticated: false,
        status: 'ok'
      });
    }

  } catch (error) {
    return res.json({
      success: true,
      authenticated: false,
      status: 'ok'
    });
  }
});
router.get('/verify', authController.verifyEmail.bind(authController));

router.post('/resend-verification', authController.resendVerification);
router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Auth service is running' });
});
router.get('/validate-reset-token', authController.validateResetToken.bind(authController));
router.get('/2fa/status', authenticate, authController.get2FAStatus.bind(authController));
router.post('/2fa/setup', authenticate, authController.setup2FA.bind(authController));
router.post('/2fa/enable', authenticate, authController.enable2FA.bind(authController));
router.post('/2fa/disable', authenticate, authController.disable2FA.bind(authController));
router.post('/2fa/verify', authController.verify2FA.bind(authController));
router.post('/2fa/backup-code', authController.verify2FABackupCode.bind(authController));
router.get('/2fa/devices', authenticate, authController.getTrustedDevices.bind(authController));
router.delete('/2fa/devices/:deviceId', authenticate, authController.revokeTrustedDevice.bind(authController));
router.post('/2fa/backup-codes/regenerate', authenticate, authController.regenerateBackupCodes.bind(authController));
router.post('/2fa/recovery/request', authController.request2FARecovery.bind(authController));
router.post('/2fa/recovery/verify', authController.verify2FARecovery.bind(authController));
export default router;