import { Router } from 'express';
import { validateTickets } from "../controllers/tickets.controller";
const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Event route working!' });
});

router.post(
  '/tickets/validate',
  validateTickets
);

export default router;