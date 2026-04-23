"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldSendNotification = exports.createNotification = exports.getNotificationDigest = exports.updateNotificationPreferences = exports.updatePreferences = exports.getNotificationPreferences = exports.getPreferences = exports.sendEventNotification = exports.sendEventReminders = exports.deleteAllRead = exports.deleteNotification = exports.deleteOne = exports.markAllAsRead = exports.markAllRead = exports.markAsRead = exports.markRead = exports.getNotifications = exports.list = exports.NotificationController = exports.setIoInstance = void 0;
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
const notificationCache = new Map();
const CACHE_DURATION = 30 * 1000;
let io;
const setIoInstance = (ioInstance) => {
    io = ioInstance;
};
exports.setIoInstance = setIoInstance;
class NotificationController {
    async list(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { page = '1', limit = '20', unreadOnly, offset } = req.query;
            const take = parseInt(limit, 10);
            const skip = offset ? parseInt(offset, 10) : (parseInt(page, 10) - 1) * take;
            const cacheKey = `notifications_${user.id}_${take}_${skip}_${unreadOnly}`;
            const cached = notificationCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                res.json({ success: true, data: cached.data, cached: true });
                return;
            }
            const where = { userId: user.id };
            if (unreadOnly === 'true')
                where.read = false;
            const [notifications, total, unreadCount] = await Promise.all([
                server_1.prisma.notification.findMany({
                    where,
                    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
                    skip,
                    take,
                }),
                server_1.prisma.notification.count({ where }),
                server_1.prisma.notification.count({ where: { userId: user.id, read: false } }),
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
        }
        catch (err) {
            next(err);
        }
    }
    async markRead(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { id } = req.params;
            const notification = await server_1.prisma.notification.findFirst({
                where: { id, userId: req.user.id },
            });
            if (!notification)
                return next(new errorHandler_1.AppError('Notification not found', 404));
            const updated = await server_1.prisma.notification.update({
                where: { id },
                data: { read: true, readAt: new Date() },
            });
            notificationCache.clear();
            res.json({ success: true, data: updated });
        }
        catch (err) {
            next(err);
        }
    }
    async markAllRead(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { count } = await server_1.prisma.notification.updateMany({
                where: { userId: req.user.id, read: false },
                data: { read: true, readAt: new Date() },
            });
            notificationCache.clear();
            res.json({ success: true, data: { updatedCount: count } });
        }
        catch (err) {
            next(err);
        }
    }
    async deleteOne(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { id } = req.params;
            const notification = await server_1.prisma.notification.findFirst({
                where: { id, userId: req.user.id },
            });
            if (!notification)
                return next(new errorHandler_1.AppError('Notification not found', 404));
            await server_1.prisma.notification.delete({ where: { id } });
            notificationCache.clear();
            res.json({ success: true, message: 'Notification deleted' });
        }
        catch (err) {
            next(err);
        }
    }
    async deleteAllRead(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { count } = await server_1.prisma.notification.deleteMany({
                where: { userId: req.user.id, read: true },
            });
            notificationCache.clear();
            res.json({ success: true, data: { deletedCount: count } });
        }
        catch (err) {
            next(err);
        }
    }
    async createNotification(userId, type, title, message, data) {
        try {
            const notification = await server_1.prisma.notification.create({
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
        }
        catch (error) {
            console.error('Create notification error:', error);
        }
    }
    async sendEventReminders(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            const tickets = await server_1.prisma.ticket.findMany({
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
                }
                else if (daysUntil <= 7 && daysUntil > 1) {
                    reminderType = 'event_soon';
                    title = `Event Coming Soon: ${ticket.event.name}`;
                    message = `Your event starts in ${daysUntil} days. Get ready!`;
                }
                if (reminderType) {
                    const existing = await server_1.prisma.notification.findFirst({
                        where: {
                            userId: user.id,
                            type: reminderType,
                            data: { path: ['eventId'], equals: ticket.event.id },
                        },
                    });
                    if (!existing) {
                        await this.createNotification(user.id, reminderType, title, message, { eventId: ticket.event.id, eventName: ticket.event.name, daysUntil });
                        reminders.push({ eventId: ticket.event.id, daysUntil });
                    }
                }
            }
            res.status(200).json({
                success: true,
                message: `Sent ${reminders.length} reminders`,
                data: reminders,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async sendEventNotification(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const { eventId, title, message, type = 'event_update' } = req.body;
            if (!eventId || !title || !message) {
                return next(new errorHandler_1.AppError('Event ID, title, and message are required', 400));
            }
            const event = await server_1.prisma.event.findUnique({
                where: { id: eventId },
                include: { organizer: true },
            });
            if (!event || event.organizer.userId !== user.id) {
                return next(new errorHandler_1.AppError('Unauthorized to send notifications for this event', 403));
            }
            const tickets = await server_1.prisma.ticket.findMany({
                where: { eventId },
                select: { attendeeEmail: true },
            });
            const uniqueUserEmails = [...new Set(tickets.map(t => t.attendeeEmail))];
            const users = await server_1.prisma.user.findMany({
                where: { email: { in: uniqueUserEmails } },
                select: { id: true },
            });
            let sentCount = 0;
            for (const attendee of users) {
                await this.createNotification(attendee.id, type, title, message, { eventId, eventName: event.name, senderId: user.id });
                sentCount++;
            }
            res.status(200).json({
                success: true,
                message: `Notification sent to ${sentCount} attendees`,
                data: { eventId, sentCount },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getPreferences(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            let preferences = await server_1.prisma.notificationPreferences.findUnique({
                where: { userId: user.id },
            });
            if (!preferences) {
                preferences = await server_1.prisma.notificationPreferences.create({
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
        }
        catch (error) {
            next(error);
        }
    }
    async updatePreferences(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const preferences = await server_1.prisma.notificationPreferences.upsert({
                where: { userId: user.id },
                update: req.body,
                create: {
                    userId: user.id,
                    ...req.body,
                },
            });
            res.status(200).json({ success: true, data: preferences });
        }
        catch (error) {
            next(error);
        }
    }
    async shouldSendNotification(userId) {
        try {
            const preferences = await server_1.prisma.notificationPreferences.findUnique({
                where: { userId },
            });
            if (!preferences || !preferences.quietHoursEnabled)
                return true;
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
            const start = preferences.quietHoursStart || '22:00';
            const end = preferences.quietHoursEnd || '08:00';
            if (start > end) {
                return !(currentTime >= start || currentTime <= end);
            }
            else {
                return !(currentTime >= start && currentTime <= end);
            }
        }
        catch (error) {
            console.error('Should send notification error:', error);
            return true;
        }
    }
    async getDigest(req, res, next) {
        try {
            const user = req.user;
            if (!user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const preferences = await server_1.prisma.notificationPreferences.findUnique({
                where: { userId: user.id },
            });
            const digestFrequency = preferences?.digestFrequency || 'daily';
            const digestTime = preferences?.digestTime || '09:00';
            let startDate;
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
            const notifications = await server_1.prisma.notification.findMany({
                where: {
                    userId: user.id,
                    createdAt: { gte: startDate },
                },
                orderBy: { createdAt: 'desc' },
            });
            const groupedByType = notifications.reduce((acc, notif) => {
                const type = notif.type;
                if (!acc[type])
                    acc[type] = [];
                acc[type].push(notif);
                return acc;
            }, {});
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
        }
        catch (error) {
            next(error);
        }
    }
}
exports.NotificationController = NotificationController;
const notificationController = new NotificationController();
const list = (req, res, next) => notificationController.list(req, res, next);
exports.list = list;
exports.getNotifications = exports.list;
const markRead = (req, res, next) => notificationController.markRead(req, res, next);
exports.markRead = markRead;
exports.markAsRead = exports.markRead;
const markAllRead = (req, res, next) => notificationController.markAllRead(req, res, next);
exports.markAllRead = markAllRead;
exports.markAllAsRead = exports.markAllRead;
const deleteOne = (req, res, next) => notificationController.deleteOne(req, res, next);
exports.deleteOne = deleteOne;
exports.deleteNotification = exports.deleteOne;
const deleteAllRead = (req, res, next) => notificationController.deleteAllRead(req, res, next);
exports.deleteAllRead = deleteAllRead;
const sendEventReminders = (req, res, next) => notificationController.sendEventReminders(req, res, next);
exports.sendEventReminders = sendEventReminders;
const sendEventNotification = (req, res, next) => notificationController.sendEventNotification(req, res, next);
exports.sendEventNotification = sendEventNotification;
const getPreferences = (req, res, next) => notificationController.getPreferences(req, res, next);
exports.getPreferences = getPreferences;
exports.getNotificationPreferences = exports.getPreferences;
const updatePreferences = (req, res, next) => notificationController.updatePreferences(req, res, next);
exports.updatePreferences = updatePreferences;
exports.updateNotificationPreferences = exports.updatePreferences;
const getNotificationDigest = (req, res, next) => notificationController.getDigest(req, res, next);
exports.getNotificationDigest = getNotificationDigest;
const createNotification = (userId, type, title, message, data) => notificationController.createNotification(userId, type, title, message, data);
exports.createNotification = createNotification;
const shouldSendNotification = (userId) => notificationController.shouldSendNotification(userId);
exports.shouldSendNotification = shouldSendNotification;
exports.default = notificationController;
//# sourceMappingURL=notification.controller.js.map