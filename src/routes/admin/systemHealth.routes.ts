// routes/admin/systemHealth.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { 
  getSystemHealth,
  getSystemMetrics,
  clearHealthCache,
} from '../../controllers/admin/systemHealth.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/health - System health check
router.get('/health', getSystemHealth);

// GET /api/admin/health/metrics - Detailed system metrics
router.get('/health/metrics', getSystemMetrics);

// DELETE /api/admin/health/cache - Clear health cache
router.delete('/health/cache', clearHealthCache);

export default router;