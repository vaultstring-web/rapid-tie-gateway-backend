// routes/attendees.routes.ts
import { Router } from 'express';
import { 
  getAttendees, 
  exportAttendeesCSV,
  getAttendeeStats 
} from '../controllers/attendees.controller';

const router: Router = Router();

// GET /api/organizer/events/:id/attendees - Get paginated attendees
router.get('/events/:id/attendees', getAttendees);

// GET /api/organizer/events/:id/attendees/export - Export to CSV
router.get('/events/:id/attendees/export', exportAttendeesCSV);

// GET /api/organizer/events/:id/attendees/stats - Get attendee statistics
router.get('/events/:id/attendees/stats', getAttendeeStats);

export default router;