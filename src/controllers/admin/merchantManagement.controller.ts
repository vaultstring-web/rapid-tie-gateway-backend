// controllers/admin/merchantManagement.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';

// Cache for merchant list
const merchantCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Get all merchants with pagination and filters
export const getAllMerchants = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const search = req.query.search as string;
    
    const skip = (page - 1) * limit;

    // Build filter conditions
    const whereCondition: any = {};
    
    if (status && status !== 'all') {
      whereCondition.status = status;
    }
    
    if (search) {
      whereCondition.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Get merchants with their data
    const merchants = await prisma.merchant.findMany({
      where: whereCondition,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
        transactions: {
          where: { status: 'success' },
          select: { amount: true, createdAt: true },
        },
        products: true,
        paymentLinks: true,
        settlements: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Calculate stats for each merchant
    const merchantsWithStats = [];
    for (const merchant of merchants) {
      // Get events separately (since Merchant doesn't have direct events relation)
      const events = await prisma.event.findMany({
        where: { organizer: { userId: merchant.userId } },
        include: {
          ticketSales: {
            include: { tickets: true },
          },
        },
      });
      
      const transactions = (merchant as any).transactions || [];
      const products = (merchant as any).products || [];
      const paymentLinks = (merchant as any).paymentLinks || [];
      const settlements = (merchant as any).settlements || [];
      
      // Total revenue from transactions
      let totalRevenue = 0;
      let totalFees = 0;
      for (const t of transactions) {
        totalRevenue += t?.amount || 0;
        totalFees += (t?.amount || 0) * 0.03;
      }
      
      // Calculate event stats
      let publishedEvents = 0;
      let completedEvents = 0;
      let totalTicketsSold = 0;
      let eventRevenue = 0;
      for (const event of events) {
        if (event.status === 'PUBLISHED') publishedEvents++;
        if (event.status === 'COMPLETED') completedEvents++;
        
        const ticketSales = event.ticketSales || [];
        for (const sale of ticketSales) {
          const tickets = sale.tickets || [];
          totalTicketsSold += tickets.length;
          eventRevenue += sale.totalAmount || 0;
        }
      }
      
      // Calculate product stats
      let activeProducts = 0;
      let totalInventory = 0;
      for (const product of products) {
        if (product.active === true) activeProducts++;
        totalInventory += product.inventory || 0;
      }
      
      // Calculate payment link stats
      let activeLinks = 0;
      let totalViews = 0;
      let totalConversions = 0;
      for (const link of paymentLinks) {
        if (link.active === true) activeLinks++;
        totalViews += link.views || 0;
        totalConversions += link.conversions || 0;
      }
      
      // Calculate settlement stats
      let completedSettlements = 0;
      let settlementAmount = 0;
      for (const settlement of settlements) {
        if (settlement.status === 'completed') completedSettlements++;
        settlementAmount += settlement.netAmount || 0;
      }
      
      merchantsWithStats.push({
        id: merchant.id,
        businessName: merchant.businessName,
        businessType: merchant.businessType,
        businessRegNo: merchant.businessRegNo,
        taxId: merchant.taxId,
        website: merchant.website,
        country: merchant.country,
        city: merchant.city,
        status: merchant.status,
        feePercentage: merchant.feePercentage,
        settlementPeriod: merchant.settlementPeriod,
        createdAt: merchant.createdAt,
        user: merchant.user,
        stats: {
          revenue: {
            total: totalRevenue + eventRevenue,
            totalFormatted: `MWK ${(totalRevenue + eventRevenue).toLocaleString()}`,
            fees: totalFees,
            feesFormatted: `MWK ${totalFees.toLocaleString()}`,
          },
          events: {
            totalEvents: events.length,
            publishedEvents,
            completedEvents,
            totalTicketsSold,
            totalRevenue: eventRevenue,
          },
          products: {
            totalProducts: products.length,
            activeProducts,
            totalInventory,
          },
          paymentLinks: {
            totalLinks: paymentLinks.length,
            activeLinks,
            totalViews,
            totalConversions,
          },
          settlements: {
            totalSettlements: settlements.length,
            completedSettlements,
            totalAmount: settlementAmount,
          },
        },
      });
    }

    const totalCount = await prisma.merchant.count({ where: whereCondition });
    const pendingCount = await prisma.merchant.count({ where: { status: 'PENDING' } });
    const activeCount = await prisma.merchant.count({ where: { status: 'ACTIVE' } });
    const suspendedCount = await prisma.merchant.count({ where: { status: 'SUSPENDED' } });

    const response = {
      merchants: merchantsWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      summary: {
        total: totalCount,
        pending: pendingCount,
        active: activeCount,
        suspended: suspendedCount,
      },
    };

    // Cache the response
    const cacheKey = `merchants_${page}_${limit}_${status || 'all'}_${search || 'none'}`;
    merchantCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_DURATION,
    });

    res.status(200).json({
      success: true,
      data: response,
      cached: false,
    });
  } catch (error) {
    console.error('Get merchants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch merchants',
    });
  }
};

// Get merchant details by ID
export const getMerchantById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
            lastLoginAt: true,
            sessions: true,
            activityLogs: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        settlements: {
          orderBy: { createdAt: 'desc' },
        },
        products: true,
        paymentLinks: true,
        apiKeys: true,
        webhooks: true,
        settings: true,
      },
    });

    if (!merchant) {
      res.status(404).json({
        success: false,
        message: 'Merchant not found',
      });
      return;
    }

    // Get events separately
    const events = await prisma.event.findMany({
      where: { organizer: { userId: merchant.userId } },
      include: {
        ticketSales: {
          include: { tickets: true },
        },
      },
    });
    
    const transactions = (merchant as any).transactions || [];
    const products = (merchant as any).products || [];
    const apiKeys = (merchant as any).apiKeys || [];
    
    // Calculate detailed stats
    let totalRevenue = 0;
    let totalFees = 0;
    for (const t of transactions) {
      totalRevenue += t?.amount || 0;
      totalFees += (t?.amount || 0) * 0.03;
    }
    
    const monthlyRevenue = await getMerchantMonthlyRevenue(merchant.id);
    
    // Calculate event stats
    let publishedEvents = 0;
    let completedEvents = 0;
    let totalTicketsSold = 0;
    let eventRevenue = 0;
    for (const event of events) {
      if (event.status === 'PUBLISHED') publishedEvents++;
      if (event.status === 'COMPLETED') completedEvents++;
      
      const ticketSales = event.ticketSales || [];
      for (const sale of ticketSales) {
        const tickets = sale.tickets || [];
        totalTicketsSold += tickets.length;
        eventRevenue += sale.totalAmount || 0;
      }
    }
    
    // Calculate product stats
    let activeProducts = 0;
    for (const product of products) {
      if (product.active === true) activeProducts++;
    }
    
    // Calculate API key stats
    let activeApiKeys = 0;
    for (const key of apiKeys) {
      if (!key.expiresAt || new Date(key.expiresAt) > new Date()) activeApiKeys++;
    }
    
    const response = {
      id: merchant.id,
      businessName: merchant.businessName,
      businessType: merchant.businessType,
      businessRegNo: merchant.businessRegNo,
      taxId: merchant.taxId,
      website: merchant.website,
      country: merchant.country,
      city: merchant.city,
      status: merchant.status,
      feePercentage: merchant.feePercentage,
      settlementPeriod: merchant.settlementPeriod,
      createdAt: merchant.createdAt,
      user: merchant.user,
      stats: {
        revenue: {
          total: totalRevenue + eventRevenue,
          totalFormatted: `MWK ${(totalRevenue + eventRevenue).toLocaleString()}`,
          fees: totalFees,
          feesFormatted: `MWK ${totalFees.toLocaleString()}`,
          monthly: monthlyRevenue,
        },
        events: {
          total: events.length,
          published: publishedEvents,
          completed: completedEvents,
          totalTicketsSold,
          totalRevenue: eventRevenue,
        },
        products: {
          total: products.length,
          active: activeProducts,
        },
        apiKeys: {
          total: apiKeys.length,
          active: activeApiKeys,
        },
      },
      settings: merchant.settings,
      apiKeys: merchant.apiKeys,
      webhooks: merchant.webhooks,
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get merchant by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch merchant details',
    });
  }
};

// Get merchant monthly revenue
async function getMerchantMonthlyRevenue(merchantId: string) {
  const monthlyData = [];
  const now = new Date();
  
  for (let i = 0; i < 6; i++) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const transactions = await prisma.transaction.aggregate({
      where: {
        merchantId,
        status: 'success',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });
    
    monthlyData.unshift({
      month: startDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
      revenue: transactions._sum.amount || 0,
    });
  }
  
  return monthlyData;
}

// Get approval queue (pending merchants)
export const getApprovalQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const pendingMerchants = await prisma.merchant.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingOrganizers = await prisma.eventOrganizer.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: {
        merchants: pendingMerchants,
        organizers: pendingOrganizers,
        total: pendingMerchants.length + pendingOrganizers.length,
      },
    });
  } catch (error) {
    console.error('Get approval queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approval queue',
    });
  }
};

// Approve merchant
export const approveMerchant = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      res.status(404).json({
        success: false,
        message: 'Merchant not found',
      });
      return;
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
      },
    });

    // Clear cache
    merchantCache.clear();

    res.status(200).json({
      success: true,
      message: 'Merchant approved successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Approve merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve merchant',
    });
  }
};

// Suspend merchant
export const suspendMerchant = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      res.status(404).json({
        success: false,
        message: 'Merchant not found',
      });
      return;
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
      },
    });

    // Log the suspension
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'MERCHANT_SUSPENDED',
        entity: 'Merchant',
        entityId: merchant.id,
        newValue: { reason, suspendedBy: user.email },
      },
    });

    // Clear cache
    merchantCache.clear();

    res.status(200).json({
      success: true,
      message: 'Merchant suspended successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Suspend merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend merchant',
    });
  }
};

// Activate merchant
export const activateMerchant = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      res.status(404).json({
        success: false,
        message: 'Merchant not found',
      });
      return;
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
      },
    });

    // Log the activation
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'MERCHANT_ACTIVATED',
        entity: 'Merchant',
        entityId: merchant.id,
        newValue: { activatedBy: user.email },
      },
    });

    // Clear cache
    merchantCache.clear();

    res.status(200).json({
      success: true,
      message: 'Merchant activated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Activate merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate merchant',
    });
  }
};

// Update merchant settings
export const updateMerchantSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { id } = req.params;
    const { feePercentage, settlementPeriod, status } = req.body;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      res.status(404).json({
        success: false,
        message: 'Merchant not found',
      });
      return;
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        feePercentage: feePercentage !== undefined ? feePercentage : undefined,
        settlementPeriod: settlementPeriod || undefined,
        status: status || undefined,
      },
    });

    // Clear cache
    merchantCache.clear();

    res.status(200).json({
      success: true,
      message: 'Merchant settings updated',
      data: updated,
    });
  } catch (error) {
    console.error('Update merchant settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update merchant settings',
    });
  }
};

// Clear merchant cache
export const clearMerchantCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    merchantCache.clear();
    res.status(200).json({
      success: true,
      message: 'Merchant cache cleared',
    });
  } catch (error) {
    console.error('Clear merchant cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};