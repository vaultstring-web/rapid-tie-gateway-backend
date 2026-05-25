// src/routes/finance.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import financeController from '../controllers/finance.controller';
import {
  disbursementReadyQuerySchema,
  batchesQuerySchema,
  budgetsQuerySchema,
  createBatchSchema,
  bulkDisbursementUploadSchema,
  processBatchSchema,
  updateProfileSchema,
} from '../validators/finance.validators';

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// All finance routes require authentication + FINANCE_OFFICER role
router.use(authenticate, authorize('FINANCE_OFFICER'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
// GET /api/finance/dashboard
router.get('/dashboard', (req, res, next) =>
  financeController.getDashboard(req as any, res, next)
);

// ─── Budgets ──────────────────────────────────────────────────────────────────
// GET /api/finance/budgets
router.get('/budgets', validate(budgetsQuerySchema), (req, res, next) =>
  financeController.getBudgets(req as any, res, next)
);

// ─── Ready to Disburse ────────────────────────────────────────────────────────
// GET /api/finance/disbursements         — approved requests not yet batched
router.get(
  '/disbursements',
  validate(disbursementReadyQuerySchema),
  (req, res, next) => financeController.getDisbursements(req as any, res, next)
);
router.get(
  '/disbursements/ready',
  validate(disbursementReadyQuerySchema),
  (req, res, next) => financeController.getDisbursements(req as any, res, next)
);

// POST /api/finance/disbursements/bulk
router.post(
  '/disbursements/bulk',
  upload.single('file'),
  validate(bulkDisbursementUploadSchema),
  (req, res, next) => financeController.uploadBulkDisbursement(req as any, res, next)
);

// ─── Disbursement Batches ─────────────────────────────────────────────────────
// GET  /api/finance/disbursements/batches
router.get(
  '/disbursements/batches',
  validate(batchesQuerySchema),
  (req, res, next) => financeController.getBatches(req as any, res, next)
);

// POST /api/finance/disbursements/batches
router.post(
  '/disbursements/batches',
  validate(createBatchSchema),
  (req, res, next) => financeController.createBatch(req as any, res, next)
);

// GET  /api/finance/disbursements/batches/:id
router.get('/disbursements/batches/:id', (req, res, next) =>
  financeController.getBatch(req as any, res, next)
);

// POST /api/finance/disbursements/batches/:id/process
router.post(
  '/disbursements/batches/:id/process',
  validate(processBatchSchema),
  (req, res, next) => financeController.processBatch(req as any, res, next)
);

// ─── Profile ─────────────────────────────────────────────────────────────────
// GET /api/finance/profile
router.get('/profile', (req, res, next) =>
  financeController.getProfile(req as any, res, next)
);

// PUT /api/finance/profile
router.put(
  '/profile',
  validate(updateProfileSchema),
  (req, res, next) => financeController.updateProfile(req as any, res, next)
);

export default router;
