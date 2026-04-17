// controllers/notification.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { prisma } from '../server';

// Cache for notifications
const notificationCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

// WebSocket io instance (will be set from server)
let io: any;

export const setIoInstance = (ioInstance: any) => {
  io = ioInstance;
};

// Get user's notifications
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { limit = 50, offset = 0, unreadOnly = false } = req.query;
    
    const cacheKey = `notifications_${user.id}_${limit}_${offset}_${unreadOnly}`;
    const cached = notificationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
      return;
    }

    const where: any = { userId: user.id };
    if (unreadOnly === 'true') {
      where.read = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, read: false },
    });

    const response = {
      notifications,
      unreadCount,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: await prisma.notification.count({ where }),
      },
    };

    notificationCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_DURATION,
    });

    res.status(200).json({ success: true, data: response, cached: false });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
};

// Mark notification as read
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId: user.id },
    });

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    // Clear cache
    notificationCache.clear();

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    });

    notificationCache.clear();

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};

// Delete notification
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId: user.id },
    });

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    await prisma.notification.delete({ where: { id } });

    notificationCache.clear();

    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

// Create notification (internal use)
export const createNotification = async (
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: any
): Promise<void> => {
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

    // Clear cache
    notificationCache.clear();

    // Send real-time notification via WebSocket
    if (io) {
      io.to(`user-${userId}`).emit('new-notification', notification);
    }

    console.log(`📧 Notification sent to ${userId}: ${title}`);
  } catch (error) {
    console.error('Create notification error:', error);
  }
};

// Send event reminder notifications
export const sendEventReminders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Get user's upcoming tickets
    const tickets = await prisma.ticket.findMany({
      where: {
        order: { customerEmail: user.email },
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
          await createNotification(
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
    console.error('Send event reminders error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reminders' });
  }
};

// Send bulk notification to event attendees
export const sendEventNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { eventId, title, message, type = 'event_update' } = req.body;

    if (!eventId || !title || !message) {
      res.status(400).json({ success: false, message: 'Event ID, title, and message are required' });
      return;
    }

    // Check if user is organizer of this event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: true },
    });

    if (!event || event.organizer.userId !== user.id) {
      res.status(403).json({ success: false, message: 'Unauthorized to send notifications for this event' });
      return;
    }

    // Get all ticket buyers for this event
    const tickets = await prisma.ticket.findMany({
      where: { eventId },
      include: { order: true },
    });

    const uniqueUserEmails = [...new Set(tickets.map(t => t.order.customerEmail))];
    
    // Get user IDs from emails
    const users = await prisma.user.findMany({
      where: { email: { in: uniqueUserEmails } },
    });

    let sentCount = 0;
    for (const attendee of users) {
      await createNotification(
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
    console.error('Send event notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to send notifications' });
  }
};

// Get notification preferences
export const getPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Get or create notification preferences
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
    console.error('Get preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to get preferences' });
  }
};

// Update notification preferences
export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { emailNotifications, pushNotifications, eventReminders, connectionRequests, messages, promotions } = req.body;

    const preferences = await prisma.notificationPreferences.upsert({
      where: { userId: user.id },
      update: {
        emailNotifications: emailNotifications !== undefined ? emailNotifications : undefined,
        pushNotifications: pushNotifications !== undefined ? pushNotifications : undefined,
        eventReminders: eventReminders !== undefined ? eventReminders : undefined,
        connectionRequests: connectionRequests !== undefined ? connectionRequests : undefined,
        messages: messages !== undefined ? messages : undefined,
        promotions: promotions !== undefined ? promotions : undefined,
      },
      create: {
        userId: user.id,
        emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
        pushNotifications: pushNotifications !== undefined ? pushNotifications : true,
        eventReminders: eventReminders !== undefined ? eventReminders : true,
        connectionRequests: connectionRequests !== undefined ? connectionRequests : true,
        messages: messages !== undefined ? messages : true,
        promotions: promotions !== undefined ? promotions : false,
      },
    });

    res.status(200).json({ success: true, data: preferences });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
};
// Get notification preferences
export const getNotificationPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    let preferences = await prisma.notificationPreferences.findUnique({
      where: { userId: user.id },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await prisma.notificationPreferences.create({
        data: {
          userId: user.id,
          emailNotifications: true,
          emailDigest: 'daily',
          pushNotifications: true,
          eventReminders: true,
          eventRecommendations: true,
          connectionRequests: true,
          messages: true,
          promotions: false,
          paymentConfirmations: true,
          eventUpdates: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          quietHoursTimezone: 'Africa/Blantyre',
          digestFrequency: 'daily',
          digestTime: '09:00',
          notifyBeforeEvent: 24,
          maxNotificationsPerDay: 50,
        },
      });
    }

    res.status(200).json({ success: true, data: preferences });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to get preferences' });
  }
};

// Update notification preferences
export const updateNotificationPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const {
      // Email settings
      emailNotifications,
      emailDigest,
      
      // Push settings
      pushNotifications,
      
      // Notification types
      eventReminders,
      eventRecommendations,
      connectionRequests,
      messages,
      promotions,
      paymentConfirmations,
      eventUpdates,
      
      // Quiet hours
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      
      // Digest settings
      digestFrequency,
      digestDay,
      digestTime,
      
      // Additional
      notifyBeforeEvent,
      maxNotificationsPerDay,
    } = req.body;

    const preferences = await prisma.notificationPreferences.upsert({
      where: { userId: user.id },
      update: {
        emailNotifications: emailNotifications !== undefined ? emailNotifications : undefined,
        emailDigest: emailDigest !== undefined ? emailDigest : undefined,
        pushNotifications: pushNotifications !== undefined ? pushNotifications : undefined,
        eventReminders: eventReminders !== undefined ? eventReminders : undefined,
        eventRecommendations: eventRecommendations !== undefined ? eventRecommendations : undefined,
        connectionRequests: connectionRequests !== undefined ? connectionRequests : undefined,
        messages: messages !== undefined ? messages : undefined,
        promotions: promotions !== undefined ? promotions : undefined,
        paymentConfirmations: paymentConfirmations !== undefined ? paymentConfirmations : undefined,
        eventUpdates: eventUpdates !== undefined ? eventUpdates : undefined,
        quietHoursEnabled: quietHoursEnabled !== undefined ? quietHoursEnabled : undefined,
        quietHoursStart: quietHoursStart !== undefined ? quietHoursStart : undefined,
        quietHoursEnd: quietHoursEnd !== undefined ? quietHoursEnd : undefined,
        quietHoursTimezone: quietHoursTimezone !== undefined ? quietHoursTimezone : undefined,
        digestFrequency: digestFrequency !== undefined ? digestFrequency : undefined,
        digestDay: digestDay !== undefined ? digestDay : undefined,
        digestTime: digestTime !== undefined ? digestTime : undefined,
        notifyBeforeEvent: notifyBeforeEvent !== undefined ? notifyBeforeEvent : undefined,
        maxNotificationsPerDay: maxNotificationsPerDay !== undefined ? maxNotificationsPerDay : undefined,
      },
      create: {
        userId: user.id,
        emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
        emailDigest: emailDigest !== undefined ? emailDigest : 'daily',
        pushNotifications: pushNotifications !== undefined ? pushNotifications : true,
        eventReminders: eventReminders !== undefined ? eventReminders : true,
        eventRecommendations: eventRecommendations !== undefined ? eventRecommendations : true,
        connectionRequests: connectionRequests !== undefined ? connectionRequests : true,
        messages: messages !== undefined ? messages : true,
        promotions: promotions !== undefined ? promotions : false,
        paymentConfirmations: paymentConfirmations !== undefined ? paymentConfirmations : true,
        eventUpdates: eventUpdates !== undefined ? eventUpdates : true,
        quietHoursEnabled: quietHoursEnabled !== undefined ? quietHoursEnabled : false,
        quietHoursStart: quietHoursStart !== undefined ? quietHoursStart : '22:00',
        quietHoursEnd: quietHoursEnd !== undefined ? quietHoursEnd : '08:00',
        quietHoursTimezone: quietHoursTimezone !== undefined ? quietHoursTimezone : 'Africa/Blantyre',
        digestFrequency: digestFrequency !== undefined ? digestFrequency : 'daily',
        digestTime: digestTime !== undefined ? digestTime : '09:00',
        notifyBeforeEvent: notifyBeforeEvent !== undefined ? notifyBeforeEvent : 24,
        maxNotificationsPerDay: maxNotificationsPerDay !== undefined ? maxNotificationsPerDay : 50,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Notification preferences updated',
      data: preferences,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
};

// Check if notification should be sent based on quiet hours
export const shouldSendNotification = async (userId: string): Promise<boolean> => {
  const preferences = await prisma.notificationPreferences.findUnique({
    where: { userId },
  });

  if (!preferences || !preferences.quietHoursEnabled) {
    return true;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

  const start = preferences.quietHoursStart || '22:00';
  const end = preferences.quietHoursEnd || '08:00';

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return !(currentTime >= start || currentTime <= end);
  } else {
    return !(currentTime >= start && currentTime <= end);
  }
  
};

// Get notification digest
export const getNotificationDigest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

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
        startDate = new Date(0); // beginning of time
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
        period: {
          start: startDate,
          end: now,
        },
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
    console.error('Get digest error:', error);
    res.status(500).json({ success: false, message: 'Failed to get digest' });
  }
};