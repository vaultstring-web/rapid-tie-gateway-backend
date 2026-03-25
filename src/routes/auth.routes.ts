import { Router, Request, Response, NextFunction } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { loginRateLimiter } from '../middlewares/rateLimiter'; // 👈 added

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

router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.forgotPassword(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
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

// Test route
router.get('/test', (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Auth route working!',
    timestamp: new Date().toISOString()
  });
});

export default router;