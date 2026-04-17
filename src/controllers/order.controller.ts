// controllers/order.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../server';
import QRCode from 'qrcode';
import { sendTicketConfirmationEmail } from '../utils/email';

export const getOrderConfirmation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const order = await prisma.ticketSale.findUnique({
      where: { id: id },
      include: {
        event: {
          include: {
            organizer: {
              select: {
                organizationName: true
              }
            }
          }
        },
        tickets: true
      }
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }

    // Generate QR codes for each ticket
    const ticketsWithQR = await Promise.all(
      order.tickets.map(async (ticket) => {
        const qrData = JSON.stringify({
          ticketId: ticket.id,
          eventId: ticket.eventId,
          orderId: order.id,
          attendeeName: ticket.attendeeName,
          verifyUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/tickets/verify/${ticket.id}`
        });
        
        const qrCodeImage = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 250
        });
        
        return {
          id: ticket.id,
          attendeeName: ticket.attendeeName,
          attendeeEmail: ticket.attendeeEmail,
          attendeePhone: ticket.attendeePhone,
          qrCode: ticket.qrCode,
          qrCodeImage: qrCodeImage,
          status: ticket.status
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          totalAmount: order.totalAmount,
          feeAmount: order.feeAmount,
          netAmount: order.netAmount,
          status: order.status,
          createdAt: order.createdAt
        },
        event: {
          id: order.event.id,
          name: order.event.name,
          description: order.event.description,
          startDate: order.event.startDate,
          endDate: order.event.endDate,
          venue: order.event.venue,
          city: order.event.city,
          organizer: order.event.organizer.organizationName
        },
        tickets: ticketsWithQR
      }
    });
    return;
  } catch (error) {
    console.error('Order confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order confirmation'
    });
    return;
  }
};

export const sendOrderEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const order = await prisma.ticketSale.findUnique({
      where: { id: id },
      include: {
        event: true,
        tickets: true
      }
    });
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    // Generate QR codes for email
    const ticketsWithQR = await Promise.all(
      order.tickets.map(async (ticket) => {
        const qrData = JSON.stringify({
          ticketId: ticket.id,
          eventId: ticket.eventId,
          orderId: order.id
        });
        
        const qrCodeImage = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 200
        });
        
        return {
          id: ticket.id,
          attendeeName: ticket.attendeeName,
          qrCode: qrCodeImage
        };
      })
    );
    
    // Send email using your existing email utility
    await sendTicketConfirmationEmail({
      email: order.customerEmail,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      eventName: order.event.name,
      eventDate: order.event.startDate,
      eventVenue: `${order.event.venue}, ${order.event.city}`,
      tickets: ticketsWithQR,
      totalAmount: order.totalAmount
    });
    
    res.status(200).json({
      success: true,
      message: 'Confirmation email sent successfully'
    });
    return;
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send confirmation email'
    });
    return;
  }
};

export const updateInventoryPermanently = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const order = await prisma.ticketSale.findUnique({
      where: { id: id },
      include: {
        tickets: true
      }
    });
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    // Check if inventory already updated
    if (order.status === 'inventory_confirmed') {
      res.status(400).json({
        success: false,
        message: 'Inventory already updated for this order'
      });
      return;
    }
    
    // Group tickets by tier
    const ticketsByTier = order.tickets.reduce((acc, ticket) => {
      acc[ticket.tierId] = (acc[ticket.tierId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Update each tier's sold count
    for (const [tierId, count] of Object.entries(ticketsByTier)) {
      await prisma.ticketTier.update({
        where: { id: tierId },
        data: {
          sold: { increment: count }
        }
      });
    }
    
    // Update order status
    await prisma.ticketSale.update({
      where: { id: order.id },
      data: { status: 'inventory_confirmed' }
    });
    
    res.status(200).json({
      success: true,
      message: 'Inventory updated permanently',
      data: {
        ticketsUpdated: ticketsByTier,
        orderStatus: 'inventory_confirmed'
      }
    });
    return;
  } catch (error) {
    console.error('Inventory update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inventory'
    });
    return;
  }
};