"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizerController = void 0;
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
const cache_1 = require("../utils/cache");
const event_validation_1 = require("../validators/event.validation");
class OrganizerController {
    async getOrganizer(req, next) {
        if (!req.user) {
            next(new errorHandler_1.AppError('Unauthorized', 401));
            return null;
        }
        const organizer = await server_1.prisma.eventOrganizer.findUnique({
            where: { userId: req.user.id },
        });
        if (!organizer) {
            next(new errorHandler_1.AppError('Organizer profile not found', 404));
            return null;
        }
        return organizer;
    }
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
            const [events, allTicketSales] = await Promise.all([
                server_1.prisma.event.findMany({
                    where: { organizerId: organizer.id },
                    include: {
                        _count: { select: { tickets: true, eventViews: true } },
                        ticketSales: { select: { totalAmount: true } },
                    },
                    orderBy: { startDate: 'desc' },
                }),
                server_1.prisma.ticketSale.aggregate({
                    where: { organizerId: organizer.id },
                    _sum: { totalAmount: true, netAmount: true },
                    _count: { id: true },
                }),
            ]);
            const upcomingEvents = events.filter((e) => e.startDate > now);
            const pastEvents = events.filter((e) => e.endDate < now);
            const totalRevenue = allTicketSales._sum.totalAmount ?? 0;
            const totalTickets = events.reduce((sum, e) => sum + e._count.tickets, 0);
            const totalViews = events.reduce((sum, e) => sum + e._count.eventViews, 0);
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
                        totalOrders: allTicketSales._count.id,
                    },
                    upcomingEvents: upcomingEvents.map((e) => ({
                        id: e.id, name: e.name, category: e.category, status: e.status,
                        startDate: e.startDate, endDate: e.endDate, venue: e.venue, city: e.city,
                        coverImage: e.coverImage, amount: e.amount,
                        ticketsSold: e._count.tickets, views: e._count.eventViews,
                    })),
                    pastEvents: pastEvents.slice(0, 10).map((e) => ({
                        id: e.id, name: e.name, category: e.category, status: e.status,
                        startDate: e.startDate, endDate: e.endDate,
                        ticketsSold: e._count.tickets,
                        revenue: e.ticketSales.reduce((s, t) => s + t.totalAmount, 0),
                    })),
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
    async getEvents(req, res, next) {
        try {
            const organizer = await this.getOrganizer(req, next);
            if (!organizer)
                return;
            const { page = '1', status, search } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10));
            const take = 20;
            const skip = (pageNum - 1) * take;
            const where = { organizerId: organizer.id };
            if (status)
                where.status = status.toUpperCase();
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { city: { contains: search, mode: 'insensitive' } },
                    { category: { contains: search, mode: 'insensitive' } },
                ];
            }
            const [events, total] = await Promise.all([
                server_1.prisma.event.findMany({
                    where,
                    orderBy: { startDate: 'desc' },
                    skip,
                    take,
                    include: {
                        _count: { select: { tickets: true, eventViews: true } },
                        ticketSales: { select: { totalAmount: true } },
                    },
                }),
                server_1.prisma.event.count({ where }),
            ]);
            const enriched = events.map((e) => ({
                ...e,
                ticketsSold: e._count.tickets,
                views: e._count.eventViews,
                revenue: e.ticketSales.reduce((s, t) => s + t.totalAmount, 0),
            }));
            res.json({
                success: true,
                data: {
                    events: enriched,
                    pagination: {
                        total,
                        page: pageNum,
                        perPage: take,
                        totalPages: Math.ceil(total / take),
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getEvent(req, res, next) {
        try {
            const organizer = await this.getOrganizer(req, next);
            if (!organizer)
                return;
            const { id } = req.params;
            const event = await server_1.prisma.event.findFirst({
                where: { id, organizerId: organizer.id },
                include: {
                    ticketTiers: true,
                    ticketSales: {
                        orderBy: { createdAt: 'desc' },
                        take: 20,
                    },
                    _count: { select: { tickets: true, eventViews: true, waitlist: true } },
                },
            });
            if (!event)
                return next(new errorHandler_1.AppError('Event not found', 404));
            const revenue = event.ticketSales.reduce((sum, s) => sum + s.totalAmount, 0);
            res.json({
                success: true,
                data: {
                    event: {
                        ...event,
                        ticketsSold: event._count.tickets,
                        views: event._count.eventViews,
                        waitlistCount: event._count.waitlist,
                        revenue,
                    },
                },
            });
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
            const { name, description, shortDescription, category, type, venue, city, country, amount, startDate, endDate, timezone, capacity, coverImage, images, visibility, } = req.body;
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
            }
            const allowedVisibility = ['public', 'merchant-only', 'all-platform'];
            if (visibility && !allowedVisibility.includes(visibility)) {
                return next(new errorHandler_1.AppError('Invalid visibility option', 400));
            }
            const event = await server_1.prisma.event.create({
                data: {
                    organizerId: req.user.organizer.id,
                    name, description, shortDescription, category, type, venue, city,
                    country: country || 'Malawi',
                    amount: amount || 0,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    timezone: timezone || 'Africa/Blantyre',
                    capacity: capacity || 0,
                    coverImage, images: parsedImages,
                    visibility: visibility || 'public',
                },
            });
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.status(201).json({
                success: true,
                message: 'Event created successfully',
                eventId: event.id,
                data: { event },
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
            const existingEvent = await server_1.prisma.event.findUnique({ where: { id: eventId } });
            if (!existingEvent)
                return next(new errorHandler_1.AppError('Event not found', 404));
            if (existingEvent.organizerId !== req.user.organizer.id) {
                return next(new errorHandler_1.AppError('Unauthorized to update this event', 403));
            }
            const parsed = event_validation_1.updateEventSchema.safeParse(req.body);
            if (!parsed.success)
                return next(new errorHandler_1.AppError(parsed.error.errors[0].message, 400));
            const data = parsed.data;
            const { name, description, shortDescription, category, type, venue, city, country, amount, startDate, endDate, timezone, capacity, coverImage, images, visibility, status } = data;
            if (status && status !== existingEvent.status) {
                const validTransitions = {
                    DRAFT: ['PUBLISHED'],
                    PUBLISHED: ['CANCELLED', 'COMPLETED'],
                    COMPLETED: [],
                    CANCELLED: [],
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
                    name, description, shortDescription, category, type, venue, city, country,
                    amount, startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                    timezone, capacity, coverImage, images: parsedImages, visibility, status,
                },
            });
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.json({
                success: true,
                message: 'Event updated successfully',
                data: { event: updatedEvent },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteEvent(req, res, next) {
        try {
            if (!req.user?.organizer?.id) {
                return next(new errorHandler_1.AppError('Only organizers can delete events', 403));
            }
            const { id } = req.params;
            const event = await server_1.prisma.event.findFirst({
                where: { id, organizerId: req.user.organizer.id },
            });
            if (!event)
                return next(new errorHandler_1.AppError('Event not found', 404));
            if (!['DRAFT', 'CANCELLED'].includes(event.status)) {
                return next(new errorHandler_1.AppError('Only DRAFT or CANCELLED events can be deleted. Cancel a published event first.', 400));
            }
            await server_1.prisma.event.delete({ where: { id } });
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.json({ success: true, message: 'Event deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    async getProfile(req, res, next) {
        try {
            const organizer = await this.getOrganizer(req, next);
            if (!organizer)
                return;
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true, email: true, phone: true,
                    firstName: true, lastName: true, profileImage: true,
                    emailVerified: true, createdAt: true,
                },
            });
            res.json({ success: true, data: { user, organizer } });
        }
        catch (error) {
            next(error);
        }
    }
    async updateProfile(req, res, next) {
        try {
            const organizer = await this.getOrganizer(req, next);
            if (!organizer)
                return;
            const { firstName, lastName, phone, profileImage, organizationName, organizationType, contactPerson, website, logo, } = req.body;
            const [updatedUser, updatedOrganizer] = await Promise.all([
                server_1.prisma.user.update({
                    where: { id: req.user.id },
                    data: {
                        ...(firstName !== undefined && { firstName }),
                        ...(lastName !== undefined && { lastName }),
                        ...(phone !== undefined && { phone }),
                        ...(profileImage !== undefined && { profileImage }),
                    },
                    select: {
                        id: true, email: true, phone: true,
                        firstName: true, lastName: true, profileImage: true,
                    },
                }),
                server_1.prisma.eventOrganizer.update({
                    where: { id: organizer.id },
                    data: {
                        ...(organizationName !== undefined && { organizationName }),
                        ...(organizationType !== undefined && { organizationType }),
                        ...(contactPerson !== undefined && { contactPerson }),
                        ...(website !== undefined && { website }),
                        ...(logo !== undefined && { logo }),
                    },
                }),
            ]);
            await OrganizerController.invalidateDashboardCache(req.user.id);
            res.json({ success: true, data: { user: updatedUser, organizer: updatedOrganizer } });
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