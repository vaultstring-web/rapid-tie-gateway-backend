// controllers/admin/fraudDetection.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';
import { cacheService } from '../../services/cache.service';

// const rulesCache = new Map<string, { data: any; expiresAt: number }>();
// const CACHE_DURATION = 60 * 1000; // 1 minute

// ==================== FRAUD RULES MANAGEMENT ====================

// Get all fraud rules
export const getFraudRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'admin:fraud:rules';
    
    // Try Redis cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      res.status(200).json({ success: true, data: cached, cached: true });
      return;
    }

    const rules = await prisma.fraudRule.findMany({
      orderBy: { priority: 'desc' },
      include: {
        transactions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const response = {
      rules,
      summary: {
        total: rules.length,
        active: rules.filter(r => r.isActive).length,
        inactive: rules.filter(r => !r.isActive).length,
      },
    };

    // Store in Redis cache (60 seconds TTL)
    await cacheService.set(cacheKey, response, 60);

    res.status(200).json({ success: true, data: response, cached: false });
  } catch (error) {
    console.error('Get fraud rules error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fraud rules' });
  }
};

// Create a new fraud rule
export const createFraudRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { name, description, type, condition, action, priority, isActive } = req.body;

    if (!name || !type || !condition || !action) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: name, type, condition, action',
      });
      return;
    }

    const rule = await prisma.fraudRule.create({
      data: {
        name,
        description,
        type,
        condition,
        action,
        priority: priority || 0,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    //  Clear Redis cache
    await cacheService.clearByPrefix('admin:fraud');

    res.status(201).json({
      success: true,
      message: 'Fraud rule created successfully',
      data: rule,
    });
  } catch (error) {
    console.error('Create fraud rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fraud rule' });
  }
};

// Update a fraud rule
export const updateFraudRule = async (req: Request, res: Response): Promise<void> => {
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
    const { name, description, type, condition, action, priority, isActive } = req.body;

    const rule = await prisma.fraudRule.update({
      where: { id },
      data: {
        name,
        description,
        type,
        condition,
        action,
        priority,
        isActive,
      },
    });

    //  Clear Redis cache
    await cacheService.clearByPrefix('admin:fraud');

    res.status(200).json({
      success: true,
      message: 'Fraud rule updated successfully',
      data: rule,
    });
  } catch (error) {
    console.error('Update fraud rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fraud rule' });
  }
};

// Delete a fraud rule
export const deleteFraudRule = async (req: Request, res: Response): Promise<void> => {
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

    await prisma.fraudRule.delete({ where: { id } });

    // Clear Redis cache
    await cacheService.clearByPrefix('admin:fraud');

    res.status(200).json({
      success: true,
      message: 'Fraud rule deleted successfully',
    });
  } catch (error) {
    console.error('Delete fraud rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fraud rule' });
  }
};

// Get fraud dashboard summary
export const getFraudDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'admin:fraud:dashboard';
    
    //  Try Redis cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      res.status(200).json({ success: true, data: cached, cached: true });
      return;
    }

    const [rules, flagged, alerts, stats] = await Promise.all([
      prisma.fraudRule.count(),
      prisma.flaggedTransaction.count(),
      prisma.fraudAlert.count({ where: { status: 'new' } }),
      prisma.flaggedTransaction.groupBy({
        by: ['severity'],
        _count: true,
      }),
    ]);

    const dashboardData = {
      summary: {
        totalRules: rules,
        activeRules: await prisma.fraudRule.count({ where: { isActive: true } }),
        flaggedTransactions: flagged,
        pendingAlerts: alerts,
      },
      severityBreakdown: stats.map(s => ({
        severity: s.severity,
        count: s._count,
      })),
      recentActivity: await prisma.flaggedTransaction.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { fraudRule: true },
      }),
    };

    //  Store in Redis cache (60 seconds TTL)
    await cacheService.set(cacheKey, dashboardData, 60);

    res.status(200).json({
      success: true,
      data: dashboardData,
      cached: false,
    });
  } catch (error) {
    console.error('Get fraud dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fraud dashboard' });
  }
};

// Clear fraud cache
export const clearFraudCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    //  Clear all fraud cache by prefix
    const cleared = await cacheService.clearByPrefix('admin:fraud');
    console.log(`🗑️ Fraud cache cleared: ${cleared} keys removed`);

    res.status(200).json({
      success: true,
      message: 'Fraud detection cache cleared',
    });
  } catch (error) {
    console.error('Clear fraud cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};