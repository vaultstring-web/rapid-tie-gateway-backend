// routes/admin/fraudDetection.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import {
  getFraudRules,
  createFraudRule,
  updateFraudRule,
  deleteFraudRule,
  testFraudRule,
  getFlaggedTransactions,
  reviewFlaggedTransaction,
  getFraudAlerts,
  acknowledgeAlert,
  resolveAlert,
  clearFraudCache,
  getFraudDashboard,
} from '../../controllers/admin/fraudDetection.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// Dashboard
router.get('/fraud/dashboard', getFraudDashboard);

// Fraud Rules
router.get('/fraud/rules', getFraudRules);
router.post('/fraud/rules', createFraudRule);
router.put('/fraud/rules/:id', updateFraudRule);
router.delete('/fraud/rules/:id', deleteFraudRule);
router.post('/fraud/rules/test', testFraudRule);

// Flagged Transactions
router.get('/fraud/flagged', getFlaggedTransactions);
router.put('/fraud/flagged/:id/review', reviewFlaggedTransaction);

// Fraud Alerts
router.get('/fraud/alerts', getFraudAlerts);
router.post('/fraud/alerts/:id/acknowledge', acknowledgeAlert);
router.post('/fraud/alerts/:id/resolve', resolveAlert);

// Utilities
router.delete('/fraud/cache', clearFraudCache);

export default router;