// src/routes/employee.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import employeeController from '../controllers/employee.controller';
import { upload } from '../config/upload.config';
import {
  createDsaRequestSchema,
  requestListQuerySchema,
  updateProfileSchema,
} from '../validators/employee.validators';

const router: Router = Router();

// All employee routes require authentication + EMPLOYEE role
router.use(authenticate, authorize('EMPLOYEE'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res, next) =>
  employeeController.getDashboard(req as any, res, next)
);

// ─── DSA Requests ─────────────────────────────────────────────────────────────
router.get(
  '/dsa/requests',
  validate(requestListQuerySchema),
  (req, res, next) => employeeController.getMyRequests(req as any, res, next)
);

router.post(
  '/dsa/requests',
  validate(createDsaRequestSchema),
  (req, res, next) => employeeController.createRequest(req as any, res, next)
);

router.get('/dsa/requests/:id', (req, res, next) =>
  employeeController.getRequest(req as any, res, next)
);

router.put('/dsa/requests/:id', (req, res, next) =>
  employeeController.updateRequest(req as any, res, next)
);

// ─── DSA Document Upload ─────────────────────────────────────────────────────
router.post(
  '/dsa/requests/:id/documents',
  upload.single('file'),
  (req, res, next) => employeeController.uploadDocument(req as any, res, next)
);

router.delete(
  '/dsa/requests/:id/documents/:documentId',
  (req, res, next) => employeeController.deleteDocument(req as any, res, next)
);

router.delete('/dsa/requests/:id', (req, res, next) =>
  employeeController.cancelRequest(req as any, res, next)
);

// ─── DSA Rates ────────────────────────────────────────────────────────────────
router.get('/dsa/rates', (req, res, next) =>
  employeeController.getDsaRates(req as any, res, next)
);

router.get('/dsa/events', (req, res, next) =>
  employeeController.getMatchingEvents(req as any, res, next)
);

// ─── Payments ──────────────────────────────────────────────────────────────────
router.get('/payments', (req, res, next) =>
  employeeController.getPayments(req as any, res, next)
);

// ─── Profile ─────────────────────────────────────────────────────────────────
router.get('/profile', (req, res, next) =>
  employeeController.getProfile(req as any, res, next)
);

router.put(
  '/profile',
  validate(updateProfileSchema),
  (req, res, next) => employeeController.updateProfile(req as any, res, next)
);

export default router;