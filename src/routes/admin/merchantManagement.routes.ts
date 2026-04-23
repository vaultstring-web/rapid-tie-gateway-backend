// routes/admin/merchantManagement.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { 
  getAllMerchants,
  getMerchantById,
  getApprovalQueue,
  approveMerchant,
  suspendMerchant,
  activateMerchant,
  updateMerchantSettings,
  clearMerchantCache,
} from '../../controllers/admin/merchantManagement.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/merchants - List all merchants
router.get('/merchants', getAllMerchants);

// GET /api/admin/merchants/approval-queue - Get pending approvals
router.get('/merchants/approval-queue', getApprovalQueue);

// GET /api/admin/merchants/:id - Get merchant details
router.get('/merchants/:id', getMerchantById);

// POST /api/admin/merchants/:id/approve - Approve merchant
router.post('/merchants/:id/approve', approveMerchant);

// POST /api/admin/merchants/:id/suspend - Suspend merchant
router.post('/merchants/:id/suspend', suspendMerchant);

// POST /api/admin/merchants/:id/activate - Activate merchant
router.post('/merchants/:id/activate', activateMerchant);

// PUT /api/admin/merchants/:id/settings - Update merchant settings
router.put('/merchants/:id/settings', updateMerchantSettings);

// DELETE /api/admin/merchants/cache - Clear merchant cache
router.delete('/merchants/cache', clearMerchantCache);

export default router;