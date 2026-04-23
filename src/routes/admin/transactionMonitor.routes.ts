// routes/admin/transactionMonitor.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import {
  getTransactionStats,
  getSuspiciousTransactions,
  getTransactionDetails,
  refundTransaction,
  markTransactionAsFailed,
  approveTransaction,
  getEventTransactions,
  getTransactionHistory,
  clearTransactionCache,
} from '../../controllers/admin/transactionMonitor.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/monitor/transactions/stats - Transaction statistics
router.get('/monitor/transactions/stats', getTransactionStats);

// GET /api/admin/monitor/transactions/suspicious - Suspicious transactions
router.get('/monitor/transactions/suspicious', getSuspiciousTransactions);

// GET /api/admin/monitor/transactions/history - Transaction history
router.get('/monitor/transactions/history', getTransactionHistory);

// GET /api/admin/monitor/transactions/event/:eventId - Event-related transactions
router.get('/monitor/transactions/event/:eventId', getEventTransactions);

// GET /api/admin/monitor/transactions/:id - Transaction details
router.get('/monitor/transactions/:id', getTransactionDetails);

// POST /api/admin/monitor/transactions/:id/refund - Refund transaction
router.post('/monitor/transactions/:id/refund', refundTransaction);

// POST /api/admin/monitor/transactions/:id/fail - Mark as failed
router.post('/monitor/transactions/:id/fail', markTransactionAsFailed);

// POST /api/admin/monitor/transactions/:id/approve - Approve transaction
router.post('/monitor/transactions/:id/approve', approveTransaction);

// DELETE /api/admin/monitor/transactions/cache - Clear cache
router.delete('/monitor/transactions/cache', clearTransactionCache);

export default router;