import { Router } from 'express';
import { getEventSales, getSalesByCustomerRole } from '../controllers/sales.controller';

const router: Router = Router();

// GET /api/organizer/events/:id/sales
router.get('/events/:id/sales', getEventSales);

// GET /api/organizer/events/:id/sales/by-role
router.get('/events/:id/sales/by-role', getSalesByCustomerRole);

export default router;