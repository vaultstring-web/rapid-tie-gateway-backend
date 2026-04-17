// routes/order.routes.ts
import { Router } from 'express';
import { getOrderConfirmation, sendOrderEmail,updateInventoryPermanently} from '../controllers/order.controller';

const router: Router = Router();

// GET /api/orders/:id - Get order with QR codes
router.get('/:id', getOrderConfirmation);

// POST /api/orders/:id/send-email - Send confirmation email
router.post('/:id/send-email', sendOrderEmail);

// POST /api/orders/:id/update-inventory - Permanently update inventory
router.post('/:id/update-inventory', updateInventoryPermanently);

export default router;