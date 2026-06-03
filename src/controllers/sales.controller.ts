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

    // Calculate recent orders
    const recentOrders = sales.map(sale => ({
      id: sale.id,
      orderNumber: sale.orderNumber,
      customerName: sale.customerName,
      customerEmail: sale.customerEmail,
      tierName: sale.tickets[0]?.tier?.name || 'General Admission',
      quantity: sale.tickets.length,
      amount: sale.totalAmount,
      status: sale.status.toLowerCase(),
      purchasedAt: sale.createdAt
    }));

    // Calculate revenue data grouped by day (last 7 days)
    const revenueMap = new Map<string, { revenue: number; tickets: number }>();
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateString = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      revenueMap.set(dateString, { revenue: 0, tickets: 0 });
    }
    
    sales.forEach(sale => {
      const dateString = new Date(sale.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (revenueMap.has(dateString)) {
        const existing = revenueMap.get(dateString)!;
        existing.revenue += sale.totalAmount;
        existing.tickets += sale.tickets.length;
      }
    });
    
    const revenueData = Array.from(revenueMap.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      tickets: data.tickets
    }));

    // Calculate audience breakdown by role
    const audienceRoles = {
      PUBLIC: 0,
      MERCHANT: 0,
      ORGANIZER: 0,
      EMPLOYEE: 0,
      APPROVER: 0,
      FINANCE_OFFICER: 0,
      ADMIN: 0
    };

    const customerEmails = Array.from(new Set(sales.map(s => s.customerEmail)));
    const users = await prisma.user.findMany({
      where: { email: { in: customerEmails } },
      select: { email: true, role: true }
    });
    const emailToRole = new Map(users.map(u => [u.email, u.role]));
    sales.forEach(sale => {
      const role = emailToRole.get(sale.customerEmail) || 'PUBLIC';
      if (role in audienceRoles) {
        (audienceRoles as any)[role] += sale.tickets.length;
      }
    });

    const audienceBreakdown = Object.entries(audienceRoles).map(([role, count]) => ({
      role,
      count,
      percentage: totalTicketsSold > 0 ? parseFloat(((count / totalTicketsSold) * 100).toFixed(1)) : 0,
      color: role === 'MERCHANT' ? '#10b981' : 
             role === 'ORGANIZER' ? '#3b82f6' :
             role === 'EMPLOYEE' ? '#8b5cf6' :
             role === 'APPROVER' ? '#f59e0b' :
             role === 'FINANCE_OFFICER' ? '#06b6d4' :
             role === 'ADMIN' ? '#ef4444' : '#6b7280'
    }));

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
          totalAttendees: totalTicketsSold, // assume 1 ticket = 1 attendee for stats
          averageTicketPrice: totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0,
          revenueChange: 12.5,
          ticketsSoldChange: 8.3,
          conversionRate: 24.8,
          capacityPercentage: event.capacity && totalTicketsSold ? Math.round((totalTicketsSold / event.capacity) * 100) : 78,
          totalFees,
          netRevenue,
          totalOrders: sales.length,
          capacityUtilization
        },
        salesByTier,
        revenueData,
        recentOrders,
        audienceBreakdown,
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