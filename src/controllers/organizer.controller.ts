// src/controllers/organizer.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import {cache} from '../utils/cache';
import { updateEventSchema } from '../validators/event.validation';

export class OrganizerController {

  // ======================
  // 📊 Dashboard endpoint
  // ======================
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const cacheKey = `organizer-dashboard-${req.user.id}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        res.json({ ...JSON.parse(cached as string), cached: true });
        return;
      }

      const organizer = await prisma.eventOrganizer.findUnique({
        where: { userId: req.user.id },
      });

      if (!organizer) return next(new AppError('Organizer not found', 404));

      const now = new Date();

      const events = await prisma.event.findMany({
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

      // 💰 Revenue & tickets
      const totalRevenue = events.reduce((sum, e) => sum + e.ticketSales.reduce((s, t) => s + t.totalAmount, 0), 0);
      const totalTickets = events.reduce((sum, e) => sum + e.tickets.length, 0);

      // 👀 Views stats
      let totalViews = 0;
      let merchantViews = 0;
      let employeeViews = 0;

      for (const event of events) {
        totalViews += event.eventViews.length;
        for (const view of event.eventViews) {
          if (view.userId) {
            const user = await prisma.user.findUnique({
              where: { id: view.userId },
              select: { role: true },
            });
            if (user?.role === 'MERCHANT') merchantViews++;
            if (user?.role === 'EMPLOYEE') employeeViews++;
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

      // ✅ Cache the dashboard for 60 seconds
      await cache.set(cacheKey, JSON.stringify(responseData), 60);

      res.json(responseData);

    } catch (error) {
      next(error);
    }
  }

  // ======================
  // ➕ Create Event endpoint
  // ======================
  async createEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.organizer?.id) {
        return next(new AppError('Only organizers can create events', 403));
      }

      const {
        name,
        description,
        shortDescription,
        category,
        type,
        venue,
        city,
        country,
        amount,
        startDate,
        endDate,
        timezone,
        capacity,
        coverImage,
        images,
        visibility
      } = req.body;
//VALIDATION
      if (!name || !description || !category || !type || !venue || !city || !startDate || !endDate) {
  return next(new AppError('Missing required fields', 400));
}

if (new Date(startDate) >= new Date(endDate)) {
  return next(new AppError('End date must be after start date', 400));
}
//IMAGE HANDLING
let parsedImages = images;

if (images && typeof images === 'string') {
  try {
    parsedImages = JSON.parse(images);
  } catch {
    return next(new AppError('Images must be valid JSON array', 400));
  }
//VISIBILITY VALIDATION
  const allowedVisibility = ['public', 'merchant-only', 'all-platform'];

if (visibility && !allowedVisibility.includes(visibility)) {
  return next(new AppError('Invalid visibility option', 400));
}

}
      const event = await prisma.event.create({
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

      // ✅ Invalidate dashboard cache so stats refresh automatically
      await OrganizerController.invalidateDashboardCache(req.user.id);

      res.status(201).json({
        success: true,
        message: 'Event created successfully',
        eventId: event.id
      });

    } catch (error) {
      next(error);
    }
  }
  // ======================
  // 🔄 Update Event
  // ======================
// ======================
// 🔄 Update Event
// ======================
async updateEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.organizer?.id) {
      return next(new AppError('Only organizers can update events', 403));
    }

    const eventId = req.params.id;

    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      return next(new AppError('Event not found', 404));
    }

    // ✅ Ownership check
    if (existingEvent.organizerId !== req.user.organizer.id) {
      return next(new AppError('Unauthorized to update this event', 403));
    }
    // ======================
    // ✅ DATE VALIDATION
    // ======================
    const parsed = updateEventSchema.safeParse(req.body);

    if (!parsed.success) {
    return next(new AppError(parsed.error.errors[0].message, 400));
      }

    const data = parsed.data;

    const {
      name,
      description,
      shortDescription,
      category,
      type,
      venue,
      city,
      country,
      amount,
      startDate,
      endDate,
      timezone,
      capacity,
      coverImage,
      images,
      visibility,
      status
    } = data;
// ======================
// ✅ STATUS TRANSITION VALIDATION
// ======================
if (status && status !== existingEvent.status) {
  const validTransitions: Record<string, string[]> = {
    DRAFT: ['PUBLISHED'],
    PUBLISHED: ['CANCELLED', 'COMPLETED'],
    COMPLETED: [],
    CANCELLED: []
  };

  const allowed = validTransitions[existingEvent.status];

  if (!allowed?.includes(status)) {
    return next(
      new AppError(
        `Invalid status transition from ${existingEvent.status} to ${status}`,
        400
      )
    );
  }
}
    // ======================
    // ✅ IMAGE HANDLING
    // ======================
    let parsedImages = images;

    if (images && typeof images === 'string') {
      try {
        parsedImages = JSON.parse(images);
      } catch {
        return next(new AppError('Images must be valid JSON array', 400));
      }
    }

    // ======================
    // ✅ VISIBILITY VALIDATION
    // ======================
    const allowedVisibility = ['public', 'merchant-only', 'all-platform'];

    if (visibility && !allowedVisibility.includes(visibility)) {
      return next(new AppError('Invalid visibility option', 400));
    }

    // ======================
    // 🔄 UPDATE EVENT (STRICTLY MODEL FIELDS)
    // ======================
    const updatedEvent = await prisma.event.update({
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

    // ======================
    // 📊 ENGAGEMENT (BASED ON eventViews)
    // ======================
    const totalViews = await prisma.eventView.count({
      where: { eventId }
    });

    // ======================
    // 🧾 LOG CHANGES (SAFE VERSION)
    // ======================
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

    // ✅ Invalidate dashboard cache
    await OrganizerController.invalidateDashboardCache(req.user.id);

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: {
        ...updatedEvent,
        totalViews 
      }
    });

  } catch (error) {
    next(error);
  }
}
  // ======================
  // 🔄 Cache invalidation
  // ======================
  static async invalidateDashboardCache(userId: string) {
    const cacheKey = `organizer-dashboard-${userId}`;
    await cache.del(cacheKey);
  }
}