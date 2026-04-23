// routes/admin/auditLog.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import {
  getAuditLogs,
  getEventAuditLogs,
  checkAuditIntegrity, 
  exportAuditLogs,
  getAuditStats,
  clearAuditCache,
} from '../../controllers/admin/auditLog.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/audit - Get audit logs
router.get('/audit', getAuditLogs);

// GET /api/admin/audit/stats - Get audit statistics
router.get('/audit/stats', getAuditStats);

// GET /api/admin/audit/event/:eventId - Get event-related audit logs
router.get('/audit/event/:eventId', getEventAuditLogs);

// GET /api/admin/audit/verify - Verify audit integrity (tamper-proof check)
router.get('/audit/verify', checkAuditIntegrity);

// GET /api/admin/audit/export - Export audit logs
router.get('/audit/export', exportAuditLogs);

// DELETE /api/admin/audit/cache - Clear audit cache
router.delete('/audit/cache', clearAuditCache);

export default router;