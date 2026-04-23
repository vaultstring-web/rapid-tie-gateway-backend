"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendeeStats = exports.exportAttendeesCSV = exports.getAttendees = void 0;
const server_1 = require("../server");
const json2csv_1 = require("json2csv");
const getAttendees = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const role = req.query.role;
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const event = await server_1.prisma.event.findUnique({
            where: { id: eventId }
        });
        if (!event) {
            res.status(404).json({
                success: false,
                message: 'Event not found'
            });
            return;
        }
        const whereCondition = {
            eventId: eventId
        };
        if (role && role !== 'all') {
            console.log(`Filtering by role: ${role} (to be implemented)`);
        }
        if (search) {
            whereCondition.OR = [
                { attendeeName: { contains: search, mode: 'insensitive' } },
                { attendeeEmail: { contains: search, mode: 'insensitive' } }
            ];
        }
        const attendees = await server_1.prisma.ticket.findMany({
            where: whereCondition,
            include: {
                tier: {
                    select: {
                        name: true,
                        price: true
                    }
                },
                order: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        customerEmail: true,
                        createdAt: true
                    }
                }
            },
            skip: skip,
            take: limit,
            orderBy: {
                createdAt: 'desc'
            }
        });
        const totalCount = await server_1.prisma.ticket.count({
            where: whereCondition
        });
        const formattedAttendees = attendees.map(attendee => ({
            id: attendee.id,
            ticketId: attendee.id.slice(-8),
            qrCode: attendee.qrCode,
            attendeeName: attendee.attendeeName,
            attendeeEmail: attendee.attendeeEmail,
            attendeePhone: attendee.attendeePhone,
            ticketType: attendee.tier.name,
            ticketPrice: attendee.tier.price,
            status: attendee.status,
            checkedInAt: attendee.checkedInAt,
            orderNumber: attendee.order.orderNumber,
            purchaseDate: attendee.order.createdAt,
            customerName: attendee.order.customerName
        }));
        res.status(200).json({
            success: true,
            data: {
                attendees: formattedAttendees,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit,
                    hasNextPage: page < Math.ceil(totalCount / limit),
                    hasPrevPage: page > 1
                },
                filters: {
                    role: role || 'all',
                    search: search || null
                }
            }
        });
        return;
    }
    catch (error) {
        console.error('Get attendees error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch attendees'
        });
        return;
    }
};
exports.getAttendees = getAttendees;
const exportAttendeesCSV = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const role = req.query.role;
        const search = req.query.search;
        const event = await server_1.prisma.event.findUnique({
            where: { id: eventId },
            select: { name: true, venue: true, startDate: true }
        });
        if (!event) {
            res.status(404).json({
                success: false,
                message: 'Event not found'
            });
            return;
        }
        const whereCondition = {
            eventId: eventId
        };
        if (role && role !== 'all') {
            console.log(`CSV export with role filter: ${role} (coming soon)`);
        }
        if (search) {
            whereCondition.OR = [
                { attendeeName: { contains: search, mode: 'insensitive' } },
                { attendeeEmail: { contains: search, mode: 'insensitive' } }
            ];
        }
        const attendees = await server_1.prisma.ticket.findMany({
            where: whereCondition,
            include: {
                tier: {
                    select: {
                        name: true,
                        price: true
                    }
                },
                order: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        customerEmail: true,
                        createdAt: true,
                        totalAmount: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        const csvData = attendees.map(attendee => ({
            'Ticket ID': attendee.id.slice(-8),
            'QR Code': attendee.qrCode,
            'Attendee Name': attendee.attendeeName,
            'Attendee Email': attendee.attendeeEmail,
            'Attendee Phone': attendee.attendeePhone || 'N/A',
            'Ticket Type': attendee.tier.name,
            'Ticket Price': attendee.tier.price,
            'Status': attendee.status,
            'Checked In': attendee.checkedInAt ? new Date(attendee.checkedInAt).toLocaleString() : 'Not checked in',
            'Order Number': attendee.order.orderNumber,
            'Purchase Date': new Date(attendee.order.createdAt).toLocaleString(),
            'Customer Name': attendee.order.customerName,
            'Customer Email': attendee.order.customerEmail,
            'Total Amount': attendee.order.totalAmount,
            'Applied Filter - Role': role || 'all'
        }));
        const parser = new json2csv_1.Parser();
        const csv = parser.parse(csvData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=attendees.csv');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        res.status(200).send(csv);
        return;
    }
    catch (error) {
        console.error('Export CSV error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export attendees'
        });
        return;
    }
};
exports.exportAttendeesCSV = exportAttendeesCSV;
const getAttendeeStats = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const stats = await server_1.prisma.ticket.groupBy({
            by: ['status'],
            where: { eventId: eventId },
            _count: true
        });
        const totalAttendees = await server_1.prisma.ticket.count({
            where: { eventId: eventId }
        });
        const checkedIn = stats.find(s => s.status === 'ACTIVE')?._count || 0;
        const used = stats.find(s => s.status === 'USED')?._count || 0;
        const cancelled = stats.find(s => s.status === 'CANCELLED')?._count || 0;
        res.status(200).json({
            success: true,
            data: {
                total: totalAttendees,
                checkedIn: used,
                pending: checkedIn,
                cancelled: cancelled,
                checkInRate: totalAttendees > 0 ? ((used / totalAttendees) * 100).toFixed(1) : 0
            }
        });
        return;
    }
    catch (error) {
        console.error('Get attendee stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch attendee statistics'
        });
        return;
    }
};
exports.getAttendeeStats = getAttendeeStats;
//# sourceMappingURL=attendees.controller.js.map