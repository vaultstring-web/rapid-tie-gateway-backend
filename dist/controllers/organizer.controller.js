"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizerController = void 0;
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
const cache_1 = require("../utils/cache");
const event_validation_1 = require("../validators/event.validation");
class OrganizerController {
    async getDashboard(req, res, next) {
        try {
            if (!req.user)
                return next(new errorHandler_1.AppError('Unauthorized', 401));
            const cacheKey = `organizer-dashboard-${req.user.id}`;
            const cached = await cache_1.cache.get(cacheKey);
            if (cached) {
                res.json({ ...JSON.parse(cached), cached: true });
                return;
            }
            const organizer = await server_1.prisma.eventOrganizer.findUnique({
                where: { userId: req.user.id },
            });
            if (!organizer)
                return next(new errorHandler_1.AppError('Organizer not found', 404));
            const now = new Date();
            const events = await server_1.prisma.event.findMany({
                where: { organizerId: organizer.id },
                include: {
                    ticketSales: true,
                    tickets: true,
                    eventViews: true,
                },
                orderBy: { startDate: 'desc' },
            });
            const upcomingEvents = events.filter(e => e.startDate > now);
            const pastEvents = events.filter(e => e.endDate < now);
            const totalRevenue = events.reduce((sum, e) => sum + e.ticketSales.reduce((s, t) => s + t.totalAmount, 0), 0);
            const totalTickets = events.reduce((sum, e) => sum + e.tickets.length, 0);
            let totalViews = 0;
            let merchantViews = 0;
            let employeeViews = 0;
            for (const event of events) {
                totalViews += event.eventViews.length;
                for (const view of event.eventViews) {
                    if (view.userId) {
                        const user = await server_1.prisma.user.findUnique({
                            where: { id: view.userId },
                            select: { role: true },
                        });
                        if (user?.role === 'MERCHANT')
                            merchantViews++;
                        if (user?.role === 'EMPLOYEE')
                            employeeViews++;
                    }
                }
            }
            const responseData = {
                success: true,
                data: {
                    summary: {
                        totalEvents: events.length,
                        upcomingEvents: upcomingEvents.length,
                        pastEvents: pastEvents.length,
                        totalTickets,
                        totalRevenue,
                        totalViews,
                        merchantViews,
                        employeeViews,
                    },
                    upcomingEvents,
                    pastEvents,
                },
                cached: false,
            };
            await cache_1.cache.set(cacheKey, JSON.stringify(responseData), 60);
            res.json(responseData);
        }
        catch (error) {
            next(error);
        }
    }
    async createEvent(req, res, next) {
        try {
            if (!req.user?.organizer?.id) {
                return next(new errorHandler_1.AppError('Only organizers can create events', 403));
            }
            const { name, description, shortDescription, category, type, venue, city, country, amount, startDate, endDate, timezone, capacity, coverImage, images, visibility } = req.body;
            if (!name || !description || !category || !type || !venue || !city || !startDate || !endDate) {
                return next(new errorHandler_1.AppError('Missing required fields', 400));
            }
            if (new Date(startDate) >= new Date(endDate)) {
                return next(new errorHandler_1.AppError('End date must be after start date', 400));
            }
            let parsedImages = images;
            if (images && typeof images === 'string') {
                try {
                    parsedImages = JSON.parse(images);
                }
                catch {
                    return next(new errorHandler_1.AppError('Images must be valid JSON array', 400));
                }
                const allowedVisibility = ['public', 'merchant-only', 'all-platform'];
                if (visibility && !allowedVisibility.includes(visibility)) {
                    return next(new errorHandler_1.AppError('Invalid visibility option', 400));
                }
            }
            const event = await server_1.prisma.event.create({
                data: {
                    organizerId: req.user.organizer.id,
                    name,
                    description,
                    shortDescription,
                    category,
                    type,
                    venue,
                    city,
                    country: country || 'Malawi',
                    amount: amount || 0,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    timezone: timezone || 'Africa/Blantyre',
                    capacity: capacity || 0,
                    coverImage,
                    images: parsedImages,
                    visibility: visibility || 'public'
                },
            });
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.status(201).json({
                success: true,
                message: 'Event created successfully',
                eventId: event.id
            });
        }
        catch (error) {
            next(error);
        }
    }
    async updateEvent(req, res, next) {
        try {
            if (!req.user?.organizer?.id) {
                return next(new errorHandler_1.AppError('Only organizers can update events', 403));
            }
            const eventId = req.params.id;
            const existingEvent = await server_1.prisma.event.findUnique({
                where: { id: eventId },
            });
            if (!existingEvent) {
                return next(new errorHandler_1.AppError('Event not found', 404));
            }
            if (existingEvent.organizerId !== req.user.organizer.id) {
                return next(new errorHandler_1.AppError('Unauthorized to update this event', 403));
            }
            const parsed = event_validation_1.updateEventSchema.safeParse(req.body);
            if (!parsed.success) {
                return next(new errorHandler_1.AppError(parsed.error.errors[0].message, 400));
            }
            const data = parsed.data;
            const { name, description, shortDescription, category, type, venue, city, country, amount, startDate, endDate, timezone, capacity, coverImage, images, visibility, status } = data;
            if (status && status !== existingEvent.status) {
                const validTransitions = {
                    DRAFT: ['PUBLISHED'],
                    PUBLISHED: ['CANCELLED', 'COMPLETED'],
                    COMPLETED: [],
                    CANCELLED: []
                };
                const allowed = validTransitions[existingEvent.status];
                if (!allowed?.includes(status)) {
                    return next(new errorHandler_1.AppError(`Invalid status transition from ${existingEvent.status} to ${status}`, 400));
                }
            }
            let parsedImages = images;
            if (images && typeof images === 'string') {
                try {
                    parsedImages = JSON.parse(images);
                }
                catch {
                    return next(new errorHandler_1.AppError('Images must be valid JSON array', 400));
                }
            }
            const allowedVisibility = ['public', 'merchant-only', 'all-platform'];
            if (visibility && !allowedVisibility.includes(visibility)) {
                return next(new errorHandler_1.AppError('Invalid visibility option', 400));
            }
            const updatedEvent = await server_1.prisma.event.update({
                where: { id: eventId },
                data: {
                    name,
                    description,
                    shortDescription,
                    category,
                    type,
                    venue,
                    city,
                    country,
                    amount,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                    timezone,
                    capacity,
                    coverImage,
                    images: parsedImages,
                    visibility,
                    status
                },
            });
            const totalViews = await server_1.prisma.eventView.count({
                where: { eventId }
            });
            const changes = {
                before: existingEvent,
                after: updatedEvent,
                updatedFields: Object.keys(data)
            };
            console.log('Event update log:', {
                eventId,
                organizerId: req.user.organizer.id,
                changes,
                timestamp: new Date()
            });
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.json({
                success: true,
                message: 'Event updated successfully',
                data: {
                    ...updatedEvent,
                    totalViews
                }
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async invalidateDashboardCache(userId) {
        const cacheKey = `organizer-dashboard-${userId}`;
        await cache_1.cache.del(cacheKey);
    }
}
exports.OrganizerController = OrganizerController;
//# sourceMappingURL=organizer.controller.js.map