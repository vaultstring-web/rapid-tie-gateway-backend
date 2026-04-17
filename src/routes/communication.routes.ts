// routes/communication.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  sendBulkMessage,
  getCommunicationStatus,
  trackOpen,
  trackClick,
  optOut,
  getEventCommunications,
} from '../controllers/communication.controller';

const router: Router = Router();

// Apply authentication to all routes (except opt-out which can be public)
router.use(authenticate);

// POST /api/organizer/communications/:eventId - Send bulk message
router.post('/communications/:eventId', sendBulkMessage);

// GET /api/organizer/communications/:communicationId/status - Get message status
router.get('/communications/:communicationId/status', getCommunicationStatus);

// GET /api/organizer/communications/event/:eventId - Get event communication history
router.get('/communications/event/:eventId', getEventCommunications);

// Public tracking endpoints (no auth required)
// GET /api/communications/track/open/:recipientId - Track email open
router.get('/communications/track/open/:recipientId', trackOpen);

// GET /api/communications/track/click/:recipientId/:url - Track link click
router.get('/communications/track/click/:recipientId/:url', trackClick);

// POST /api/communications/opt-out - Opt out from communications (public)
router.post('/communications/opt-out', optOut);

export default router;