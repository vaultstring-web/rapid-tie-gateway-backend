// src/routes/organizer.routes.ts
import { Router } from 'express';
import { OrganizerController } from '../controllers/organizer.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { createTicketTier } from "../controllers/ticketTier.controller";

const router = Router();
const organizerController = new OrganizerController();

// GET dashboard
router.get(
  '/events',
  authenticate,
  authorize('ORGANIZER'),
  (req, res, next) => organizerController.getDashboard(req, res, next)
);

// CREATE event
router.post(
  '/events',
  authenticate,
  authorize('ORGANIZER'),
  (req, res, next) => organizerController.createEvent(req, res, next)
);

//UPDATE event
router.put(
  '/events/:id', 
  authenticate, authorize('ORGANIZER'), 
(req, res, next) => organizerController.updateEvent(req, res, next)
);

// CREATE ticket tier
router.post(
  "/events/:id/tiers",
  createTicketTier
);
export default router;