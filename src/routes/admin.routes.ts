// routes/admin.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  getAdminDashboard, 
  clearAdminCache,
  getSystemHealthOnly,
} from '../controllers/admin.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/dashboard - Admin dashboard with all metrics
router.get('/dashboard', getAdminDashboard);

// GET /api/admin/health - System health only
router.get('/health', getSystemHealthOnly);

// DELETE /api/admin/cache - Clear admin dashboard cache
router.delete('/cache', clearAdminCache);

export default router;