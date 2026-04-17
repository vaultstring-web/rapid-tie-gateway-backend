import { Router } from 'express';
import { getEventTiers, validateTickets } from "../controllers/tickets.controller";
import { purchaseTickets } from "../controllers/ticketPurchases.controller";
import { checkInTicket, batchCheckIn,getCheckInStats } from "../controllers/ticketCheckIn.controller";

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Event route working!' });
});
router.get(
  '/:id/tiers', 
  getEventTiers
);

router.post(
  '/tickets/validate',
  validateTickets
);
router.post(
  '/:id/purchase', 
  purchaseTickets
);
// POST /api/tickets/checkin
router.post(
  '/checkin', 
  checkInTicket
);
router.post('/checkin/batch', batchCheckIn);  
router.get('/checkin/stats/:eventId', getCheckInStats);  
export default router;