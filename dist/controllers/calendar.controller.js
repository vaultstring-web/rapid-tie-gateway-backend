"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCalendarCache = exports.sendEventReminders = exports.exportCalendar = exports.getUserCalendar = void 0;
const server_1 = require("../server");
const ical_generator_1 = __importDefault(require("ical-generator"));
const calendarCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
const getUserCalendar = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const userId = user.id;
        const userEmail = user.email;
        const view = req.query.view || 'month';
        const startDate = req.query.start ? new Date(req.query.start) : new Date();
        const endDate = req.query.end ? new Date(req.query.end) : new Date();
        console.log('Calendar request - User:', { userId, userEmail, role: user.role });
        const cacheKey = `calendar_${userId}_${view}_${startDate.toISOString()}_${endDate.toISOString()}`;
        const cached = calendarCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            res.status(200).json({
                success: true,
                data: cached.data,
                cached: true
            });
            return;
        }
        const tickets = await server_1.prisma.ticket.findMany({
            where: {
                order: {
                    customerEmail: userEmail
                }
            },
            include: {
                event: {
                    include: {
                        organizer: true
                    }
                },
                order: true
            }
        });
        console.log(`Found ${tickets.length} tickets for user ${userEmail}`);
        const calendarEvents = tickets.map(ticket => ({
            id: ticket.event.id,
            title: ticket.event.name,
            description: ticket.event.description || ticket.event.shortDescription || '',
            startDate: ticket.event.startDate,
            endDate: ticket.event.endDate,
            location: `${ticket.event.venue}, ${ticket.event.city}`,
            venue: ticket.event.venue,
            city: ticket.event.city,
            type: ticket.status === 'USED' ? 'attended' : 'purchased',
            ticketId: ticket.id,
            orderId: ticket.orderId,
            qrCode: ticket.qrCode
        }));
        let filteredEvents = calendarEvents;
        if (req.query.start) {
            filteredEvents = calendarEvents.filter(event => event.startDate >= startDate && event.startDate <= endDate);
        }
        const sortedEvents = filteredEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        let formattedEvents;
        switch (view) {
            case 'month':
                formattedEvents = formatForMonthView(sortedEvents);
                break;
            case 'week':
                formattedEvents = formatForWeekView(sortedEvents, startDate);
                break;
            case 'day':
                formattedEvents = formatForDayView(sortedEvents, startDate);
                break;
            default:
                formattedEvents = formatForListView(sortedEvents);
        }
        const stats = {
            totalEvents: calendarEvents.length,
            attended: calendarEvents.filter(e => e.type === 'attended').length,
            purchased: calendarEvents.filter(e => e.type === 'purchased').length,
            interested: 0,
            upcoming: calendarEvents.filter(e => e.startDate > new Date()).length,
            past: calendarEvents.filter(e => e.startDate < new Date()).length
        };
        const upcomingEvents = calendarEvents
            .filter(e => e.startDate > new Date() && e.startDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
            .slice(0, 10);
        const response = {
            events: formattedEvents,
            stats,
            upcomingEvents: upcomingEvents.map(event => ({
                id: event.id,
                title: event.title,
                startDate: event.startDate,
                location: event.location,
                type: event.type,
                daysUntil: Math.ceil((event.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            })),
            view,
            dateRange: {
                start: startDate,
                end: endDate
            }
        };
        calendarCache.set(cacheKey, {
            data: response,
            expiresAt: Date.now() + CACHE_DURATION
        });
        res.status(200).json({
            success: true,
            data: response,
            cached: false
        });
        return;
    }
    catch (error) {
        console.error('Calendar error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch calendar data'
        });
        return;
    }
};
exports.getUserCalendar = getUserCalendar;
function formatForMonthView(events) {
    const eventsByDate = new Map();
    events.forEach(event => {
        const dateKey = event.startDate.toISOString().split('T')[0];
        if (!eventsByDate.has(dateKey)) {
            eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey).push({
            id: event.id,
            title: event.title,
            time: event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: event.type,
            location: event.location
        });
    });
    return Array.from(eventsByDate.entries()).map(([date, dayEvents]) => ({
        date,
        events: dayEvents
    }));
}
function formatForWeekView(events, startDate) {
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        weekDays.push(currentDate);
    }
    return weekDays.map(day => ({
        date: day.toISOString().split('T')[0],
        dayName: day.toLocaleDateString('en-US', { weekday: 'long' }),
        events: events.filter(event => event.startDate.toISOString().split('T')[0] === day.toISOString().split('T')[0]).map(event => ({
            id: event.id,
            title: event.title,
            time: event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: event.type,
            location: event.location
        }))
    }));
}
function formatForDayView(events, targetDate) {
    const dayEvents = events.filter(event => event.startDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]);
    return {
        date: targetDate.toISOString().split('T')[0],
        dayName: targetDate.toLocaleDateString('en-US', { weekday: 'long' }),
        events: dayEvents.map(event => ({
            id: event.id,
            title: event.title,
            startTime: event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            endTime: event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            description: event.description,
            location: event.location,
            venue: event.venue,
            city: event.city,
            type: event.type,
            ticketId: event.ticketId,
            qrCode: event.qrCode
        }))
    };
}
function formatForListView(events) {
    return events.map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        location: event.location,
        venue: event.venue,
        city: event.city,
        type: event.type,
        daysUntil: Math.ceil((event.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }));
}
const exportCalendar = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const userEmail = user.email;
        const format = req.query.format || 'ical';
        const tickets = await server_1.prisma.ticket.findMany({
            where: {
                order: {
                    customerEmail: userEmail
                }
            },
            include: {
                event: {
                    include: {
                        organizer: true
                    }
                }
            }
        });
        const calendar = (0, ical_generator_1.default)({ name: 'My Events Calendar' });
        tickets.forEach(ticket => {
            if (ticket.event) {
                calendar.createEvent({
                    id: ticket.event.id,
                    summary: ticket.event.name,
                    description: ticket.event.description || '',
                    start: ticket.event.startDate,
                    end: ticket.event.endDate,
                    location: `${ticket.event.venue}, ${ticket.event.city}`,
                    url: `${process.env.APP_URL}/events/${ticket.event.id}`,
                    organizer: {
                        name: ticket.event.organizer?.organizationName || 'Event Organizer',
                        email: 'events@example.com'
                    }
                });
            }
        });
        if (format === 'google') {
            const events = tickets.map(ticket => {
                if (!ticket.event)
                    return null;
                return {
                    title: ticket.event.name,
                    description: ticket.event.description || '',
                    startDate: ticket.event.startDate,
                    endDate: ticket.event.endDate,
                    location: `${ticket.event.venue}, ${ticket.event.city}`
                };
            }).filter(Boolean);
            const googleUrl = generateGoogleCalendarUrl(events);
            res.status(200).json({
                success: true,
                data: {
                    format: 'google',
                    url: googleUrl,
                    instructions: 'Click the link to add to Google Calendar'
                }
            });
            return;
        }
        const icalString = calendar.toString();
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="my-events-calendar.ics"');
        res.status(200).send(icalString);
        return;
    }
    catch (error) {
        console.error('Export calendar error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export calendar'
        });
        return;
    }
};
exports.exportCalendar = exportCalendar;
function generateGoogleCalendarUrl(events) {
    const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    if (events.length === 0)
        return baseUrl;
    const event = events[0];
    const params = new URLSearchParams({
        text: event.title,
        details: event.description,
        location: event.location,
        dates: `${formatDateForGoogle(event.startDate)}/${formatDateForGoogle(event.endDate)}`
    });
    return `${baseUrl}&${params.toString()}`;
}
function formatDateForGoogle(date) {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
}
const sendEventReminders = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const userEmail = user.email;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tickets = await server_1.prisma.ticket.findMany({
            where: {
                order: {
                    customerEmail: userEmail
                },
                event: {
                    startDate: {
                        gte: new Date(),
                        lte: tomorrow
                    }
                }
            },
            include: {
                event: {
                    include: {
                        organizer: true
                    }
                }
            }
        });
        const reminders = tickets.map(ticket => ({
            eventId: ticket.event.id,
            eventName: ticket.event.name,
            startDate: ticket.event.startDate,
            location: `${ticket.event.venue}, ${ticket.event.city}`,
            ticketId: ticket.id,
            qrCode: ticket.qrCode,
            hoursUntil: Math.ceil((ticket.event.startDate.getTime() - Date.now()) / (1000 * 60 * 60))
        }));
        res.status(200).json({
            success: true,
            data: {
                reminders,
                count: reminders.length,
                message: reminders.length > 0
                    ? `You have ${reminders.length} event(s) in the next 24 hours`
                    : 'No upcoming events in the next 24 hours'
            }
        });
        return;
    }
    catch (error) {
        console.error('Send reminders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reminders'
        });
        return;
    }
};
exports.sendEventReminders = sendEventReminders;
const clearCalendarCache = async (_req, res) => {
    try {
        calendarCache.clear();
        res.status(200).json({
            success: true,
            message: 'Calendar cache cleared'
        });
        return;
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to clear cache'
        });
        return;
    }
};
exports.clearCalendarCache = clearCalendarCache;
//# sourceMappingURL=calendar.controller.js.map