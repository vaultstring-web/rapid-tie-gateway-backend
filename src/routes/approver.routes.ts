// src/routes/approver.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { ApproverController } from '../controllers/approver.controller';
import { pendingApprovalsQuerySchema, requestsQuerySchema } from '../validators/approver.validators';

const router: Router = Router();
const approverController = new ApproverController();

// All approver routes require authentication + APPROVER role
router.use(authenticate, authorize('APPROVER'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res, next) =>
  approverController.getDashboard(req as any, res, next)
);

// ─── All requests (any status) ───────────────────────────────────────────────
router.get(
  '/requests',
  validate(requestsQuerySchema),
  (req, res, next) => approverController.getAllRequests(req as any, res, next)
);

// ─── Pending requests ─────────────────────────────────────────────────────────
router.get(
  '/pending',
  validate(pendingApprovalsQuerySchema),
  (req, res, next) => approverController.getPending(req as any, res, next)
);

// ─── Single request detail ────────────────────────────────────────────────────
router.get('/requests/:id', (req, res, next) =>
  approverController.getDetail(req as any, res, next)
);

// ─── Approve / Reject ─────────────────────────────────────────────────────────
router.post('/requests/:id/approve', (req, res, next) =>
  approverController.processAction('approve')(req as any, res, next)
);
router.post('/requests/:id/reject', (req, res, next) =>
  approverController.processAction('reject')(req as any, res, next)
);

// ─── Profile ─────────────────────────────────────────────────────────────────
router.get('/profile', (req, res, next) =>
  approverController.getProfile(req as any, res, next)
);
router.put('/profile', (req, res, next) =>
  approverController.updateProfile(req as any, res, next)
);

export default router;