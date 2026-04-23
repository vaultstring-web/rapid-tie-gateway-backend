// src/routes/employee.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import employeeController from '../controllers/employee.controller';
import {
  createDsaRequestSchema,
  requestListQuerySchema,
  updateProfileSchema,
} from '../validators/employee.validators';

const router: Router = Router();

// All employee routes require authentication + EMPLOYEE role
router.use(authenticate, authorize('EMPLOYEE'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
// GET /api/employee/dashboard
router.get('/dashboard', (req, res, next) =>
  employeeController.getDashboard(req as any, res, next)
);

// ─── DSA Requests ─────────────────────────────────────────────────────────────
// GET  /api/employee/dsa/requests          — paginated list
router.get(
  '/dsa/requests',
  validate(requestListQuerySchema),
  (req, res, next) => employeeController.getMyRequests(req as any, res, next)
);

// POST /api/employee/dsa/requests          — submit new request
router.post(
  '/dsa/requests',
  validate(createDsaRequestSchema),
  (req, res, next) => employeeController.createRequest(req as any, res, next)
);

// GET  /api/employee/dsa/requests/:id      — single request detail
router.get('/dsa/requests/:id', (req, res, next) =>
  employeeController.getRequest(req as any, res, next)
);

// DELETE /api/employee/dsa/requests/:id   — cancel request
router.delete('/dsa/requests/:id', (req, res, next) =>
  employeeController.cancelRequest(req as any, res, next)
);

// ─── DSA Rates ────────────────────────────────────────────────────────────────
// GET /api/employee/dsa/rates             — per-diem rates for this employee's org
router.get('/dsa/rates', (req, res, next) =>
  employeeController.getDsaRates(req as any, res, next)
);

// ─── Profile ─────────────────────────────────────────────────────────────────
// GET /api/employee/profile
router.get('/profile', (req, res, next) =>
  employeeController.getProfile(req as any, res, next)
);

// PUT /api/employee/profile
router.put(
  '/profile',
  validate(updateProfileSchema),
  (req, res, next) => employeeController.updateProfile(req as any, res, next)
);

export default router;
