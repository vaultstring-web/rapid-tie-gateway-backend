// src/controllers/notification.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';

// Cache for notifications
const notificationCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

// WebSocket io instance
let io: any;

export const setIoInstance = (ioInstance: any) => {
  io = ioInstance;
};

export class NotificationController {
  /**
   * GET /api/notifications
   * List all notifications for the authenticated user.
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      const { page = '1', limit = '20', unreadOnly, offset } = req.query as Record<string, string>;
      
      // Support both page-based and limit/offset pagination
      const take = parseInt(limit, 10);
      const skip = offset ? parseInt(offset, 10) : (parseInt(page, 10) - 1) * take;
      
      const cacheKey = `notifications_${user.id}_${take}_${skip}_${unreadOnly}`;
      const cached = notificationCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json({ success: true, data: cached.data, cached: true });
        return;
      }

      const where: any = { userId: user.id };
      if (unreadOnly === 'true') where.read = false;

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
          skip,
          take,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: user.id, read: false } }),
      ]);

      const data = {
        notifications,
        unreadCount,
        pagination: {
          total,
          page: Math.floor(skip / take) + 1,
          perPage: take,
          totalPages: Math.ceil(total / take),
          limit: take,
          offset: skip,
        },
      };

      notificationCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_DURATION,
      });

      res.json({ success: true, data, cached: false });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/notifications/:id/read
   * Mark a single notification as read.
   */
  async markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const { id } = req.params;
      const notification = await prisma.notification.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!notification) return next(new AppError('Notification not found', 404));

      const updated = await prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
      });

      notificationCache.clear();
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/notifications/read-all
   * Mark all notifications as read for the current user.
   */
  async markAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const { count } = await prisma.notification.updateMany({
        where: { userId: req.user.id, read: false },
        data: { read: true, readAt: new Date() },
      });

      notificationCache.clear();
      res.json({ success: true, data: { updatedCount: count } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/notifications/:id
   * Delete a single notification.
   */
  async deleteOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const { id } = req.params;
      const notification = await prisma.notification.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!notification) return next(new AppError('Notification not found', 404));

      await prisma.notification.delete({ where: { id } });

      notificationCache.clear();
      res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/notifications
   * Delete all read notifications for the current user.
   */
  async deleteAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const { count } = await prisma.notification.deleteMany({
        where: { userId: req.user.id, read: true },
      });

      notificationCache.clear();
      res.json({ success: true, data: { deletedCount: count } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create notification (internal use)
   */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data || {},
        },
      });

      notificationCache.clear();

      if (io) {
        io.to(`user-${userId}`).emit('new-notification', notification);
      }
    } catch (error) {
      console.error('Create notification error:', error);
    }
  }

  /**
   * POST /api/notifications/reminders
   * Send event reminder notifications
   */
  async sendEventReminders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Get user's upcoming tickets
      const tickets = await prisma.ticket.findMany({
        where: {
          attendeeEmail: user.email,
          event: {
            startDate: { gte: new Date(), lte: nextWeek },
          },
        },
        include: { event: true },
      });

      const reminders = [];
      for (const ticket of tickets) {
        const daysUntil = Math.ceil((ticket.event.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        let reminderType = '';
        let title = '';
        let message = '';

        if (daysUntil === 1) {
          reminderType = 'event_tomorrow';
          title = 'Event Tomorrow! 🎉';
          message = `Your event "${ticket.event.name}" is tomorrow at ${new Date(ticket.event.startDate).toLocaleTimeString()}`;
        } else if (daysUntil <= 7 && daysUntil > 1) {
          reminderType = 'event_soon';
          title = `Event Coming Soon: ${ticket.event.name}`;
          message = `Your event starts in ${daysUntil} days. Get ready!`;
        }

        if (reminderType) {
          const existing = await prisma.notification.findFirst({
            where: {
              userId: user.id,
              type: reminderType,
              data: { path: ['eventId'], equals: ticket.event.id },
            },
          });

          if (!existing) {
            await this.createNotification(
              user.id,
              reminderType,
              title,
              message,
              { eventId: ticket.event.id, eventName: ticket.event.name, daysUntil }
            );
            reminders.push({ eventId: ticket.event.id, daysUntil });
          }
        }
      }

      res.status(200).json({
        success: true,
        message: `Sent ${reminders.length} reminders`,
        data: reminders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/notifications/event
   * Send bulk notification to event attendees
   */
  async sendEventNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      const { eventId, title, message, type = 'event_update' } = req.body;

      if (!eventId || !title || !message) {
        return next(new AppError('Event ID, title, and message are required', 400));
      }

      // Check if user is organizer of this event
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { organizer: true },
      });

      if (!event || event.organizer.userId !== user.id) {
        return next(new AppError('Unauthorized to send notifications for this event', 403));
      }

      // Get all ticket buyers for this event
      const tickets = await prisma.ticket.findMany({
        where: { eventId },
        select: { attendeeEmail: true },
      });

      const uniqueUserEmails = [...new Set(tickets.map(t => t.attendeeEmail))];
      
      // Get user IDs from emails
      const users = await prisma.user.findMany({
        where: { email: { in: uniqueUserEmails } },
        select: { id: true },
      });

      let sentCount = 0;
      for (const attendee of users) {
        await this.createNotification(
          attendee.id,
          type,
          title,
          message,
          { eventId, eventName: event.name, senderId: user.id }
        );
        sentCount++;
      }

      res.status(200).json({
        success: true,
        message: `Notification sent to ${sentCount} attendees`,
        data: { eventId, sentCount },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/notification-preferences
   */
  async getPreferences(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      let preferences = await prisma.notificationPreferences.findUnique({
        where: { userId: user.id },
      });

      if (!preferences) {
        preferences = await prisma.notificationPreferences.create({
          data: {
            userId: user.id,
            emailNotifications: true,
            pushNotifications: true,
            eventReminders: true,
            connectionRequests: true,
            messages: true,
            promotions: false,
          },
        });
      }

      res.status(200).json({ success: true, data: preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/users/notification-preferences
   */
  async updatePreferences(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      const preferences = await prisma.notificationPreferences.upsert({
        where: { userId: user.id },
        update: req.body,
        create: {
          userId: user.id,
          ...req.body,
        },
      });

      res.status(200).json({ success: true, data: preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if notification should be sent based on quiet hours
   */
  async shouldSendNotification(userId: string): Promise<boolean> {
    try {
      const preferences = await prisma.notificationPreferences.findUnique({
        where: { userId },
      });

      if (!preferences || !preferences.quietHoursEnabled) return true;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

      const start = preferences.quietHoursStart || '22:00';
      const end = preferences.quietHoursEnd || '08:00';

      if (start > end) {
        return !(currentTime >= start || currentTime <= end);
      } else {
        return !(currentTime >= start && currentTime <= end);
      }
    } catch (error) {
      console.error('Should send notification error:', error);
      return true;
    }
  }

  /**
   * GET /api/notifications/digest
   */
  async getDigest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) return next(new AppError('Unauthorized', 401));

      const preferences = await prisma.notificationPreferences.findUnique({
        where: { userId: user.id },
      });

      const digestFrequency = preferences?.digestFrequency || 'daily';
      const digestTime = preferences?.digestTime || '09:00';
      
      let startDate: Date;
      const now = new Date();

      switch (digestFrequency) {
        case 'daily':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 1);
          break;
        case 'weekly':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        default:
          startDate = new Date(0);
      }

      const notifications = await prisma.notification.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'desc' },
      });

      const groupedByType = notifications.reduce((acc, notif) => {
        const type = notif.type;
        if (!acc[type]) acc[type] = [];
        acc[type].push(notif);
        return acc;
      }, {} as Record<string, any[]>);

      res.status(200).json({
        success: true,
        data: {
          frequency: digestFrequency,
          digestTime,
          period: { start: startDate, end: now },
          summary: {
            total: notifications.length,
            unread: notifications.filter(n => !n.read).length,
            byType: Object.keys(groupedByType).map(type => ({
              type,
              count: groupedByType[type].length,
            })),
          },
          notifications: notifications.slice(0, 50),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

const notificationController = new NotificationController();

// Named exports to satisfy functional-style routing
export const list = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.list(req, res, next);
export const getNotifications = list;
export const markRead = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.markRead(req, res, next);
export const markAsRead = markRead;
export const markAllRead = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.markAllRead(req, res, next);
export const markAllAsRead = markAllRead;
export const deleteOne = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.deleteOne(req, res, next);
export const deleteNotification = deleteOne;
export const deleteAllRead = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.deleteAllRead(req, res, next);
export const sendEventReminders = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.sendEventReminders(req, res, next);
export const sendEventNotification = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.sendEventNotification(req, res, next);
export const getPreferences = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.getPreferences(req, res, next);
export const getNotificationPreferences = getPreferences;
export const updatePreferences = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.updatePreferences(req, res, next);
export const updateNotificationPreferences = updatePreferences;
export const getNotificationDigest = (req: AuthRequest, res: Response, next: NextFunction) => notificationController.getDigest(req, res, next);
export const createNotification = (userId: string, type: string, title: string, message: string, data?: any) => 
  notificationController.createNotification(userId, type, title, message, data);
export const shouldSendNotification = (userId: string) => notificationController.shouldSendNotification(userId);

export default notificationController;