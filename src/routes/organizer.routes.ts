// src/routes/organizer.routes.ts
import express, { Router } from 'express';
import { OrganizerController } from '../controllers/organizer.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { createTicketTier } from "../controllers/ticketTier.controller";

const router: Router = express.Router();
const oc = new OrganizerController();

// All routes require authentication + ORGANIZER role
router.use(authenticate, authorize('ORGANIZER'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res, next) => oc.getDashboard(req, res, next));

// ─── Events ──────────────────────────────────────────────────────────────────
// GET  /api/organizer/events           — paginated event list
router.get('/events', (req, res, next) => oc.getEvents(req, res, next));

// POST /api/organizer/events           — create event
router.post('/events', (req, res, next) => oc.createEvent(req, res, next));

// GET  /api/organizer/events/:id       — single event detail
router.get('/events/:id', (req, res, next) => oc.getEvent(req, res, next));

// PUT  /api/organizer/events/:id       — update event
router.put('/events/:id', (req, res, next) => oc.updateEvent(req, res, next));

// DELETE /api/organizer/events/:id     — delete event (DRAFT only)
router.delete('/events/:id', (req, res, next) => oc.deleteEvent(req, res, next));

// ─── Profile ─────────────────────────────────────────────────────────────────
router.get('/profile', (req, res, next) => oc.getProfile(req, res, next));
router.put('/profile', (req, res, next) => oc.updateProfile(req, res, next));

// CREATE ticket tier
router.post(
  "/events/:id/tiers",
  createTicketTier
);
export default router;