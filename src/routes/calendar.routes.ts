// routes/calendar.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  getUserCalendar, 
  exportCalendar, 
  sendEventReminders,
  clearCalendarCache 
} from '../controllers/calendar.controller';

const router: Router = Router();

// Apply authentication middleware to all calendar routes
router.use(authenticate);

// GET /api/calendar - Get user's calendar
router.get('/', getUserCalendar);

// GET /api/calendar/export - Export to iCal/Google Calendar
router.get('/export', exportCalendar);

// GET /api/calendar/reminders - Get/send reminders for upcoming events
router.get('/reminders', sendEventReminders);

// DELETE /api/calendar/cache - Clear calendar cache
router.delete('/cache', clearCalendarCache);

export default router;