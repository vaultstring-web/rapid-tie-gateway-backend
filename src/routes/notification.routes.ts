// routes/notification.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendEventReminders,
  sendEventNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
  getNotificationDigest,
} from '../controllers/notification.controller';

const router: Router = Router();

// Apply authentication to all notification routes
router.use(authenticate);

// GET /api/notifications - Get user's notifications
router.get('/', getNotifications);

// GET /api/notifications/digest - Get notification digest
router.get('/digest', getNotificationDigest);

// POST /api/notifications/reminders - Send event reminders
router.post('/reminders', sendEventReminders);

// POST /api/notifications/event - Send notification to event attendees (organizer only)
router.post('/event', sendEventNotification);

// PUT /api/notifications/read-all - Mark all as read
router.put('/read-all', markAllAsRead);

// PUT /api/notifications/:id/read - Mark single as read
router.put('/:id/read', markAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', deleteNotification);
// GET /api/users/notification-preferences - Get preferences
router.get('/users/notification-preferences', getNotificationPreferences);

// PUT /api/users/notification-preferences - Update preferences
router.put('/users/notification-preferences', updateNotificationPreferences);

export default router;