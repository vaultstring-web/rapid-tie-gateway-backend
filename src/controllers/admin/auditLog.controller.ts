// controllers/admin/auditLog.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';
import { verifyAuditIntegrity as verifyAuditIntegrityService } from '../../services/auditLog.service';

// Cache for audit logs
const auditCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

// Get audit logs with filtering and pagination
export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const action = req.query.action as string;
    const entityType = req.query.entityType as string;
    const userId = req.query.userId as string;
    const status = req.query.status as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const search = req.query.search as string;
    
    const skip = (page - 1) * limit;

    // Build filter conditions
    const whereCondition: any = {};
    
    if (action && action !== 'all') {
      whereCondition.action = action;
    }
    
    if (entityType && entityType !== 'all') {
      whereCondition.entityType = entityType;
    }
    
    if (userId) {
      whereCondition.userId = userId;
    }
    
    if (status && status !== 'all') {
      whereCondition.status = status;
    }
    
    if (startDate) {
      whereCondition.createdAt = { gte: startDate };
    }
    
    if (endDate) {
      whereCondition.createdAt = { ...whereCondition.createdAt, lte: endDate };
    }
    
    if (search) {
      whereCondition.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          transaction: {
            select: {
              id: true,
              transactionRef: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: whereCondition }),
    ]);

    // Get unique actions and entity types for filters
    const uniqueActions = await prisma.auditLog.groupBy({
      by: ['action'],
      _count: true,
    });
    
    const uniqueEntityTypes = await prisma.auditLog.groupBy({
      by: ['entityType'],
      _count: true,
    });

    const response = {
      logs: auditLogs.map(log => ({
        id: log.id,
        action: log.action,
        status: log.status,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        user: log.user,
        transactionId: log.transactionId,
        transaction: log.transaction,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        oldValues: log.oldValues,
        newValues: log.newValues,
        hash: log.hash,
        previousHash: log.previousHash,
        createdAt: log.createdAt,
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      filters: {
        availableActions: uniqueActions.map(a => ({ action: a.action, count: a._count })),
        availableEntityTypes: uniqueEntityTypes.map(e => ({ entityType: e.entityType, count: e._count })),
      },
    };

    // Cache the response
    const cacheKey = `audit_logs_${page}_${limit}_${action}_${entityType}_${userId}_${status}_${search}`;
    auditCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_DURATION,
    });

    res.status(200).json({
      success: true,
      data: response,
      cached: false,
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
};

// Get event-related audit logs
export const getEventAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Event', entityId: eventId },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalCount = await prisma.auditLog.count({
      where: {
        OR: [
          { entityType: 'Event', entityId: eventId },
        ],
      },
    });

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error('Get event audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch event audit logs' });
  }
};

// Verify audit integrity - Fixed: renamed to avoid conflict and added proper parameters
export const checkAuditIntegrity = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    // Call the service function which expects 0 arguments
    const result = await verifyAuditIntegrityService();

    res.status(200).json({
      success: true,
      data: {
        valid: result.valid,
        tamperedLogs: result.tamperedLogs,
        message: result.valid 
          ? 'Audit log integrity verified - no tampering detected'
          : `Tampering detected in ${result.tamperedLogs.length} log entries`,
      },
    });
  } catch (error) {
    console.error('Verify audit integrity error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify audit integrity' });
  }
};

// Export audit logs to CSV
export const exportAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { format = 'csv' } = req.query;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const whereCondition: any = {};
    if (startDate) whereCondition.createdAt = { gte: startDate };
    if (endDate) whereCondition.createdAt = { ...whereCondition.createdAt, lte: endDate };

    const logs = await prisma.auditLog.findMany({
      where: whereCondition,
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['ID', 'Action', 'Status', 'Entity Type', 'Entity ID', 'User', 'IP Address', 'Timestamp', 'Details'];
      const csvRows = [headers];
      
      for (const log of logs) {
        csvRows.push([
          log.id,
          log.action,
          log.status,
          log.entityType || '',
          log.entityId || '',
          log.user?.email || 'System',
          log.ipAddress || '',
          log.createdAt.toISOString(),
          JSON.stringify(log.details || {}),
        ]);
      }
      
      const csvContent = csvRows.map(row => row.join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
      res.status(200).send(csvContent);
      return;
    }

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to export audit logs' });
  }
};

// Get audit statistics
export const getAuditStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, todayCount, weekCount, monthCount, byAction, byEntityType, byUser] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: thisWeek } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        _count: true,
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    // Get user details for top users
    const topUsers = await Promise.all(
      byUser.map(async (u) => {
        const userRecord = await prisma.user.findUnique({
          where: { id: u.userId || undefined },
          select: { email: true, firstName: true, lastName: true },
        });
        return {
          userId: u.userId,
          user: userRecord?.email || 'System',
          count: u._count,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total,
          today: todayCount,
          week: weekCount,
          month: monthCount,
        },
        topActions: byAction.map(a => ({ action: a.action, count: a._count })),
        topUsers,
        byEntityType: byEntityType.map(e => ({ entityType: e.entityType || 'Unknown', count: e._count })),
      },
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit stats' });
  }
};

// Clear audit cache
export const clearAuditCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    auditCache.clear();
    res.status(200).json({
      success: true,
      message: 'Audit cache cleared',
    });
  } catch (error) {
    console.error('Clear audit cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};