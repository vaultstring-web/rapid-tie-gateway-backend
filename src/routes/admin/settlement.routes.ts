import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { getReconciliationExceptions, listSettlements, runSettlement } from '../../controllers/admin/settlement.controller';

const router: Router = Router();

router.use(authenticate);

// GET /api/admin/settlements
router.get('/settlements', listSettlements);

// POST /api/admin/settlements/run
router.post('/settlements/run', runSettlement);

// GET /api/admin/reconciliation/exceptions
router.get('/reconciliation/exceptions', getReconciliationExceptions);

export default router;

