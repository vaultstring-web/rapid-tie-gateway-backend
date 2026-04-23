// routes/admin/securityDashboard.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import {
  getSecurityDashboard,
  clearSecurityCache,
  getIPBlacklist,
  blockIP,
} from '../../controllers/admin/securityDashboard.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/security - Security dashboard
router.get('/security', getSecurityDashboard);

// GET /api/admin/security/ip-blacklist - Get suspicious IPs
router.get('/security/ip-blacklist', getIPBlacklist);

// POST /api/admin/security/block-ip - Block an IP address
router.post('/security/block-ip', blockIP);

// DELETE /api/admin/security/cache - Clear security cache
router.delete('/security/cache', clearSecurityCache);

export default router;