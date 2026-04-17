import { Request, Response } from 'express';
import { prisma } from '../server';
import { Parser } from 'json2csv';

export const getAttendees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const role = req.query.role as string;
    const search = req.query.search as string;
    
    const skip = (page - 1) * limit;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Event not found'
      });
      return;
    }

    // Build filter conditions
    const whereCondition: any = {
      eventId: eventId
    };

    // Filter by attendee role (if role column exists, otherwise skip)
    if (role && role !== 'all') {
      // You can add role filtering when you add role to Ticket model
      // For now, just log that role filtering is available
      console.log(`Filtering by role: ${role} (to be implemented)`);
    }

    // Search by attendee name or email
    if (search) {
      whereCondition.OR = [
        { attendeeName: { contains: search, mode: 'insensitive' } },
        { attendeeEmail: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get attendees with pagination
    const attendees = await prisma.ticket.findMany({
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

    // Get total count for pagination
    const totalCount = await prisma.ticket.count({
      where: whereCondition
    });

    // Format attendee data
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
  } catch (error) {
    console.error('Get attendees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendees'
    });
    return;
  }
};

// controllers/attendees.controller.ts
// controllers/attendees.controller.ts
export const exportAttendeesCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: eventId } = req.params;
    const role = req.query.role as string;
    const search = req.query.search as string;

    // Get event details
    const event = await prisma.event.findUnique({
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

    // Build filter conditions
    const whereCondition: any = {
      eventId: eventId
    };

    // Role filter (reserved for future implementation)
    if (role && role !== 'all') {
      console.log(`CSV export with role filter: ${role} (coming soon)`);
    }

    // Search by attendee name or email
    if (search) {
      whereCondition.OR = [
        { attendeeName: { contains: search, mode: 'insensitive' } },
        { attendeeEmail: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get all attendees (no pagination for CSV)
    const attendees = await prisma.ticket.findMany({
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

    // Format data for CSV
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

    // Generate CSV
    const parser = new Parser();
    const csv = parser.parse(csvData);

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendees.csv');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).send(csv);
    // ...TO HERE
    
    return;
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export attendees'
    });
    return;
  }
};

export const getAttendeeStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: eventId } = req.params;

    const stats = await prisma.ticket.groupBy({
      by: ['status'],
      where: { eventId: eventId },
      _count: true
    });

    const totalAttendees = await prisma.ticket.count({
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
  } catch (error) {
    console.error('Get attendee stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendee statistics'
    });
    return;
  }
};