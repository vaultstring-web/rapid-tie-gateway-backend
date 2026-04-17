import { Request, Response } from "express";
import { prisma } from "../server";
import crypto from 'crypto';

// Secret key for QR code signature validation
const QR_SECRET = process.env.QR_SECRET || 'your-qr-secret-key-change-in-production';

// Helper: Verify QR code signature
const verifyQRCode = (qrCode: string, signature: string): boolean => {
  if (!signature) return false; // Allow without signature for backward compatibility
  
  const expectedSignature = crypto
    .createHmac('sha256', QR_SECRET)
    .update(qrCode)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

// Helper: Generate QR code with signature (for ticket generation)
export const generateSignedQRCode = (ticketId: string): { qrCode: string; signature: string } => {
  const qrCode = ticketId;
  const signature = crypto
    .createHmac('sha256', QR_SECRET)
    .update(qrCode)
    .digest('hex');
  return { qrCode, signature };
};

// Check-in a ticket by QR code (ENHANCED VERSION)
export const checkInTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { qrCode, signature, role, deviceId } = req.body;

    if (!qrCode) {
      res.status(400).json({ success: false, message: "QR code is required" });
      return;
    }

    // NEW: Validate QR code signature (optional for backward compatibility)
    if (signature && !verifyQRCode(qrCode, signature)) {
      res.status(401).json({ 
        success: false, 
        message: "Invalid QR code signature" 
      });
      return;
    }

    // Find the ticket by QR code
    const ticket = await prisma.ticket.findUnique({
      where: { qrCode },
      include: { 
        order: true, 
        event: true,
        tier: true 
      },
    });

    if (!ticket) {
      res.status(404).json({ success: false, message: "Ticket not found" });
      return;
    }

    // Check if ticket is already checked in
    if (ticket.checkedInAt) {
      res.status(400).json({ 
        success: false, 
        message: "Ticket already checked in",
        data: {
          checkedInAt: ticket.checkedInAt,
          checkedInBy: ticket.checkedInBy
        }
      });
      return;
    }

    // NEW: Check if event has ended
    if (ticket.event.endDate < new Date()) {
      res.status(400).json({ 
        success: false, 
        message: "Event has already ended" 
      });
      return;
    }

    // Mark ticket as checked in
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "USED",
        checkedInAt: new Date(),
        checkedInBy: role || (req as any).user?.role || "ORGANIZER",
      },
    });

    // NEW: Log check-in for analytics (including deviceId)
    await prisma.auditLog.create({
      data: {
        action: 'TICKET_CHECKIN',
        status: 'success',
        details: {
          ticketId: ticket.id,
          eventId: ticket.eventId,
          tierId: ticket.tierId,
          role: role || 'ORGANIZER',
          deviceId: deviceId || 'unknown', // NOW deviceId IS USED HERE
          timestamp: new Date().toISOString()
        },
        userId: (req as any).user?.id || null
      }
    });

    res.status(200).json({
      success: true,
      message: "Ticket successfully checked in",
      data: {
        ticketId: updatedTicket.id.slice(-8),
        attendeeName: updatedTicket.attendeeName,
        ticketType: ticket.tier?.name,
        eventName: ticket.event.name,
        checkedInAt: updatedTicket.checkedInAt,
        status: updatedTicket.status,
        deviceUsed: deviceId || 'unknown' // Include deviceId in response
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Batch check-in (for multiple tickets)
export const batchCheckIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickets, role, deviceId } = req.body;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: "Tickets array is required" 
      });
      return;
    }

    const results = [];
    const errors = [];

    for (const ticketData of tickets) {
      try {
        const { qrCode, signature } = ticketData;
        
        // Find ticket
        const ticket = await prisma.ticket.findUnique({
          where: { qrCode },
          include: { event: true }
        });

        if (!ticket) {
          errors.push({ qrCode, error: 'Ticket not found' });
          continue;
        }

        if (ticket.checkedInAt) {
          errors.push({ qrCode, error: 'Already checked in' });
          continue;
        }

        // Verify signature if provided
        if (signature && !verifyQRCode(qrCode, signature)) {
          errors.push({ qrCode, error: 'Invalid signature' });
          continue;
        }

        // Update ticket
        const updatedTicket = await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: "USED",
            checkedInAt: new Date(),
            checkedInBy: role || "BATCH_SCANNER",
          }
        });

        // Log batch check-in with deviceId
        await prisma.auditLog.create({
          data: {
            action: 'BATCH_CHECKIN',
            status: 'success',
            details: {
              ticketId: ticket.id,
              eventId: ticket.eventId,
              role: role || 'BATCH_SCANNER',
              deviceId: deviceId || 'unknown',
              batchCount: tickets.length
            }
          }
        });

        results.push({
          ticketId: updatedTicket.id.slice(-8),
          attendeeName: updatedTicket.attendeeName,
          status: 'success'
        });
      } catch (error) {
        errors.push({ qrCode: ticketData.qrCode, error: 'Processing failed' });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        total: tickets.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors: errors.slice(0, 10),
        deviceUsed: deviceId || 'unknown' // Include deviceId in response
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get check-in statistics
export const getCheckInStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params; // Changed from 'id' to 'eventId' to match route

    const stats = await prisma.ticket.groupBy({
      by: ['status'],
      where: { eventId: eventId },
      _count: true
    });

    const checkInsByRole = await prisma.ticket.groupBy({
      by: ['checkedInBy'],
      where: { 
        eventId: eventId,
        status: 'USED'
      },
      _count: true
    });

    const totalTickets = await prisma.ticket.count({
      where: { eventId: eventId }
    });

    const checkedIn = stats.find(s => s.status === 'USED')?._count || 0;
    const pending = stats.find(s => s.status === 'ACTIVE')?._count || 0;

    res.status(200).json({
      success: true,
      data: {
        total: totalTickets,
        checkedIn,
        pending,
        checkInRate: totalTickets > 0 ? ((checkedIn / totalTickets) * 100).toFixed(1) : 0,
        checkInsByRole: checkInsByRole.map(role => ({
          role: role.checkedInBy || 'unknown',
          count: role._count
        }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};