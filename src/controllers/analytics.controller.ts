import { Request, Response } from 'express';
import { prisma } from '../server';

export const getEventAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30days' } = req.query;
    
    // Calculate date range
    const startDate = new Date();
    switch (timeframe) {
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get all events with their data
    const events = await prisma.event.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      include: {
        organizer: {
          select: {
            organizationName: true
          }
        },
        ticketTiers: true,
        ticketSales: {
          include: {
            tickets: true
          }
        },
        eventViews: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate cross-platform metrics
    const platformMetrics = {
      public: { views: 0, ticketsSold: 0, revenue: 0, conversionRate: 0 },
      'merchant-only': { views: 0, ticketsSold: 0, revenue: 0, conversionRate: 0 },
      'all-platform': { views: 0, ticketsSold: 0, revenue: 0, conversionRate: 0 }
    };

    // Role-based view tracking
    const viewsByRole: Record<string, number> = {
      PUBLIC: 0,
      MERCHANT: 0,
      ORGANIZER: 0,
      EMPLOYEE: 0,
      APPROVER: 0,
      FINANCE_OFFICER: 0,
      ADMIN: 0
    };

    // Location data for heat maps
    const locationData: Record<string, { city: string; eventCount: number; totalViews: number; totalTickets: number; revenue: number }> = {};

    // Process each event
    events.forEach(event => {
      const visibility = event.visibility as keyof typeof platformMetrics;
      const views = event.eventViews.length;
      const ticketsSold = event.ticketSales.reduce((sum, sale) => sum + sale.tickets.length, 0);
      const revenue = event.ticketSales.reduce((sum, sale) => sum + sale.totalAmount, 0);

      // Update platform metrics
      if (platformMetrics[visibility]) {
        platformMetrics[visibility].views += views;
        platformMetrics[visibility].ticketsSold += ticketsSold;
        platformMetrics[visibility].revenue += revenue;
        platformMetrics[visibility].conversionRate = 
          platformMetrics[visibility].views > 0 
            ? (platformMetrics[visibility].ticketsSold / platformMetrics[visibility].views) * 100 
            : 0;
      }

      // Track views by role from eventViews
      event.eventViews.forEach(() => {
        viewsByRole.PUBLIC += 1;
      });

      // Aggregate location data for heat maps
      const locationKey = `${event.city}-${event.country}`;
      if (!locationData[locationKey]) {
        locationData[locationKey] = {
          city: event.city,
          eventCount: 0,
          totalViews: 0,
          totalTickets: 0,
          revenue: 0
        };
      }
      locationData[locationKey].eventCount += 1;
      locationData[locationKey].totalViews += views;
      locationData[locationKey].totalTickets += ticketsSold;
      locationData[locationKey].revenue += revenue;
    });

    // Calculate overall metrics
    const totalEvents = events.length;
    const totalViews = events.reduce((sum, e) => sum + e.eventViews.length, 0);
    const totalTicketsSold = events.reduce((sum, e) => 
      sum + e.ticketSales.reduce((s, sale) => s + sale.tickets.length, 0), 0);
    const totalRevenue = events.reduce((sum, e) => 
      sum + e.ticketSales.reduce((s, sale) => s + sale.totalAmount, 0), 0);
    const overallConversionRate = totalViews > 0 ? (totalTicketsSold / totalViews) * 100 : 0;

    // Calculate average ticket price
    const avgTicketPrice = totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0;

    // Get top performing events
    const topEvents = events
      .map(event => ({
        id: event.id,
        name: event.name,
        views: event.eventViews.length,
        ticketsSold: event.ticketSales.reduce((sum, sale) => sum + sale.tickets.length, 0),
        revenue: event.ticketSales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        conversionRate: event.eventViews.length > 0 
          ? (event.ticketSales.reduce((sum, sale) => sum + sale.tickets.length, 0) / event.eventViews.length) * 100 
          : 0,
        organizer: event.organizer.organizationName
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Get location heat map data (top 20 locations)
    const heatMapData = Object.values(locationData)
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 20)
      .map(loc => ({
        city: loc.city,
        eventCount: loc.eventCount,
        views: loc.totalViews,
        ticketsSold: loc.totalTickets,
        revenue: loc.revenue,
        intensity: totalViews > 0 ? Math.min((loc.totalViews / totalViews) * 100, 100) : 0
      }));

    // Demographic breakdown (based on ticket tiers and pricing)
    const demographicBreakdown = await getDemographicBreakdown(startDate);

    res.status(200).json({
      success: true,
      data: {
        timeframe,
        summary: {
          totalEvents,
          totalViews,
          totalTicketsSold,
          totalRevenue,
          overallConversionRate: overallConversionRate.toFixed(2),
          avgTicketPrice: Math.round(avgTicketPrice)
        },
        platformMetrics: {
          public: {
            views: platformMetrics.public.views,
            ticketsSold: platformMetrics.public.ticketsSold,
            revenue: platformMetrics.public.revenue,
            conversionRate: platformMetrics.public.conversionRate.toFixed(2)
          },
          merchantOnly: {
            views: platformMetrics['merchant-only'].views,
            ticketsSold: platformMetrics['merchant-only'].ticketsSold,
            revenue: platformMetrics['merchant-only'].revenue,
            conversionRate: platformMetrics['merchant-only'].conversionRate.toFixed(2)
          },
          allPlatform: {
            views: platformMetrics['all-platform'].views,
            ticketsSold: platformMetrics['all-platform'].ticketsSold,
            revenue: platformMetrics['all-platform'].revenue,
            conversionRate: platformMetrics['all-platform'].conversionRate.toFixed(2)
          }
        },
        viewsByRole,
        demographicBreakdown,
        heatMap: heatMapData,
        topEvents,
        recentTrends: await getRecentTrends(startDate)
      }
    });
    return;
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data'
    });
    return;
  }
};

// Helper: Get demographic breakdown
async function getDemographicBreakdown(startDate: Date) {
  const ticketSales = await prisma.ticketSale.findMany({
    where: {
      createdAt: { gte: startDate }
    },
    include: {
      tickets: {
        include: {
          tier: true
        }
      }
    }
  });

  const priceRanges = {
    'Under MWK 10,000': 0,
    'MWK 10,000 - 25,000': 0,
    'MWK 25,001 - 50,000': 0,
    'MWK 50,001 - 100,000': 0,
    'Above MWK 100,000': 0
  };

  ticketSales.forEach(sale => {
    const avgPricePerTicket = sale.totalAmount / sale.tickets.length;
    if (avgPricePerTicket < 10000) {
      priceRanges['Under MWK 10,000'] += sale.tickets.length;
    } else if (avgPricePerTicket <= 25000) {
      priceRanges['MWK 10,000 - 25,000'] += sale.tickets.length;
    } else if (avgPricePerTicket <= 50000) {
      priceRanges['MWK 25,001 - 50,000'] += sale.tickets.length;
    } else if (avgPricePerTicket <= 100000) {
      priceRanges['MWK 50,001 - 100,000'] += sale.tickets.length;
    } else {
      priceRanges['Above MWK 100,000'] += sale.tickets.length;
    }
  });

  return priceRanges;
}

// Helper: Get recent trends
async function getRecentTrends(startDate: Date) {
  const trends = [];
  const now = new Date();
  let currentDate = new Date(startDate);

  while (currentDate <= now) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 7);
    
    const sales = await prisma.ticketSale.findMany({
      where: {
        createdAt: {
          gte: currentDate,
          lt: nextDate
        }
      },
      include: {
        tickets: true
      }
    });

    trends.push({
      week: currentDate.toISOString().split('T')[0],
      ticketsSold: sales.reduce((sum, sale) => sum + sale.tickets.length, 0),
      revenue: sales.reduce((sum, sale) => sum + sale.totalAmount, 0),
      orders: sales.length
    });

    currentDate = nextDate;
  }

  return trends.slice(-12);
}

// Get event-specific analytics
export const getEventAnalyticsById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organizer: true,
        ticketTiers: true,
        ticketSales: {
          include: {
            tickets: true
          }
        },
        eventViews: true
      }
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Event not found'
      });
      return;
    }

    const views = event.eventViews.length;
    const ticketsSold = event.ticketSales.reduce((sum, sale) => sum + sale.tickets.length, 0);
    const revenue = event.ticketSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const conversionRate = views > 0 ? (ticketsSold / views) * 100 : 0;

    // Sales over time
    const salesOverTime = await getEventSalesOverTime(event.id);

    // Tier performance - removed unused variable
    const tierPerformance = event.ticketTiers.map(tier => {
      const tierRevenue = event.ticketSales.reduce((sum, sale) => {
        const tierTickets = sale.tickets.filter(t => t.tierId === tier.id);
        return sum + (tierTickets.length * tier.price);
      }, 0);

      return {
        tierId: tier.id,
        name: tier.name,
        price: tier.price,
        capacity: tier.quantity,
        sold: tier.sold,
        available: tier.quantity - tier.sold,
        revenue: tierRevenue,
        fillRate: ((tier.sold / tier.quantity) * 100).toFixed(2),
        percentageOfTotal: revenue > 0 ? ((tierRevenue / revenue) * 100).toFixed(2) : '0'
      };
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
          status: event.status,
          visibility: event.visibility
        },
        summary: {
          totalViews: views,
          totalTicketsSold: ticketsSold,
          totalRevenue: revenue,
          conversionRate: conversionRate.toFixed(2),
          capacityUtilization: event.capacity ? ((ticketsSold / event.capacity) * 100).toFixed(2) : 'N/A'
        },
        tierPerformance,
        salesOverTime,
        dailyViews: await getDailyViews(event.id)
      }
    });
    return;
  } catch (error) {
    console.error('Event analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event analytics'
    });
    return;
  }
};

async function getEventSalesOverTime(eventId: string) {
  const sales = await prisma.ticketSale.findMany({
    where: { eventId },
    include: {
      tickets: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const dailyData: Record<string, { tickets: number; revenue: number }> = {};
  
  sales.forEach(sale => {
    const date = sale.createdAt.toISOString().split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = { tickets: 0, revenue: 0 };
    }
    dailyData[date].tickets += sale.tickets.length;
    dailyData[date].revenue += sale.totalAmount;
  });

  return Object.entries(dailyData).map(([date, data]) => ({
    date,
    ticketsSold: data.tickets,
    revenue: data.revenue
  }));
}

async function getDailyViews(eventId: string) {
  const views = await prisma.eventView.findMany({
    where: { eventId },
    orderBy: { viewedAt: 'asc' }
  });

  const dailyViews: Record<string, number> = {};
  
  views.forEach(view => {
    const date = view.viewedAt.toISOString().split('T')[0];
    dailyViews[date] = (dailyViews[date] || 0) + 1;
  });

  return Object.entries(dailyViews).map(([date, count]) => ({
    date,
    views: count
  }));
}