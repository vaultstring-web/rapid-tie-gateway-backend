// src/routes/notification.routes.ts
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
  deleteAllRead,
} from '../controllers/notification.controller';

const router: Router = Router();

// Apply authentication to all notification routes
router.use(authenticate);

// GET /api/notifications - Get user's notifications (paginated)
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

// DELETE /api/notifications - Delete all read notifications
router.delete('/', deleteAllRead);

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', deleteNotification);

// Preferences routes
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);

// Backward compatibility or alternate preference paths if needed
router.get('/users/notification-preferences', getNotificationPreferences);
router.put('/users/notification-preferences', updateNotificationPreferences);

export default router;
