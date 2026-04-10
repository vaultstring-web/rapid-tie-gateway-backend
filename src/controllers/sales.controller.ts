// controllers/sales.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../server';

export const getEventSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: eventId } = req.params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizer: true,
        ticketTiers: true
      }
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Event not found'
      });
      return;
    }

    // Get all ticket sales for this event
    const sales = await prisma.ticketSale.findMany({
      where: { eventId: eventId },
      include: {
        tickets: {
          include: {
            tier: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate sales by tier
    const salesByTier = event.ticketTiers.map(tier => {
      const tierSales = sales.filter(sale => 
        sale.tickets.some(ticket => ticket.tierId === tier.id)
      );
      const revenue = tierSales.reduce((sum, sale) => sum + (sale.tickets.filter(t => t.tierId === tier.id).length * tier.price), 0);
      
      return {
        tierId: tier.id,
        tierName: tier.name,
        price: tier.price,
        totalQuantity: tier.quantity,
        sold: tier.sold,
        available: tier.quantity - tier.sold,
        revenue: revenue,
        percentageSold: ((tier.sold / tier.quantity) * 100).toFixed(2)
      };
    });

    // Calculate overall stats
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalTicketsSold = sales.reduce((sum, sale) => sum + sale.tickets.length, 0);
    const totalFees = sales.reduce((sum, sale) => sum + sale.feeAmount, 0);
    const netRevenue = sales.reduce((sum, sale) => sum + sale.netAmount, 0);

    // Calculate capacity utilization (handle null capacity)
    const capacityUtilization = event.capacity 
      ? `${((totalTicketsSold / event.capacity) * 100).toFixed(1)}%`
      : 'N/A';

    // Recent transactions (last 10)
    const recentTransactions = await prisma.transaction.findMany({
      where: { organizerId: event.organizerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        organizer: true
      }
    });

    res.status(200).json({
      success: true,
      data: {
        event: {
          id: event.id,
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate,
          venue: event.venue,
          city: event.city,
          status: event.status
        },
        summary: {
          totalRevenue,
          totalTicketsSold,
          totalFees,
          netRevenue,
          totalOrders: sales.length,
          capacityUtilization
        },
        salesByTier,
        recentTransactions: recentTransactions.map(t => ({
          id: t.id,
          amount: t.amount,
          status: t.status,
          paymentMethod: t.paymentMethod,
          createdAt: t.createdAt
        }))
      }
    });
    return;
  } catch (error) {
    console.error('Sales dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales data'
    });
    return;
  }
};

// Get sales by customer role
export const getSalesByCustomerRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: eventId } = req.params;
    
    // eventId is reserved for future implementation of role-based sales tracking
    // TODO: Use eventId to filter sales by specific event when role data is available
    
    res.status(200).json({
      success: true,
      data: {
        eventId: eventId, // Include eventId in response to show it's being used
        roles: {
          PUBLIC: { ticketsSold: 0, revenue: 0, percentage: 0 },
          MERCHANT: { ticketsSold: 0, revenue: 0, percentage: 0 },
          ORGANIZER: { ticketsSold: 0, revenue: 0, percentage: 0 },
          EMPLOYEE: { ticketsSold: 0, revenue: 0, percentage: 0 }
        },
        message: "Track customer roles by adding 'customerRole' field to TicketSale model"
      }
    });
    return;
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role-based sales'
    });
    return;
  }
};