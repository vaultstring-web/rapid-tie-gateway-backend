// controllers/admin/fraudDetection.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';

// Cache for fraud rules
const rulesCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

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

    const cacheKey = 'fraud_rules';
    const cached = rulesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
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

    rulesCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_DURATION });

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

    // Clear cache
    rulesCache.clear();

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

    // Clear cache
    rulesCache.clear();

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

    // Clear cache
    rulesCache.clear();

    res.status(200).json({
      success: true,
      message: 'Fraud rule deleted successfully',
    });
  } catch (error) {
    console.error('Delete fraud rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fraud rule' });
  }
};

// ==================== FRAUD DETECTION ENGINE ====================

// Evaluate a transaction against all active fraud rules
export async function evaluateFraudRules(transaction: any): Promise<{
  flagged: boolean;
  matches: any[];
  score: number;
}> {
  const activeRules = await prisma.fraudRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' },
  });

  const matches = [];
  let totalScore = 0;

  for (const rule of activeRules) {
    const isMatch = await evaluateRuleCondition(rule, transaction);
    if (isMatch) {
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        priority: rule.priority,
      });
      totalScore += rule.priority || 10;
    }
  }

  const score = Math.min(totalScore, 100);
  const flagged = matches.length > 0 && score > 20;

  if (flagged) {
    // Create flagged transaction record
    await prisma.flaggedTransaction.create({
      data: {
        transactionId: transaction.id,
        fraudRuleId: matches[0].ruleId,
        reason: `Matched ${matches.length} fraud rule(s)`,
        severity: score > 70 ? 'critical' : score > 40 ? 'high' : 'medium',
        status: 'pending',
        score,
        metadata: { matches, transactionSnapshot: transaction },
      },
    });

    // Create alert for high severity
    if (score > 70) {
      await prisma.fraudAlert.create({
        data: {
          ruleId: matches[0].ruleId,
          transactionId: transaction.id,
          title: `High risk transaction detected`,
          description: `Transaction ${transaction.transactionRef} flagged with fraud score ${score}`,
          severity: 'critical',
          status: 'new',
        },
      });
    }
  }

  return { flagged, matches, score };
}

// Evaluate rule condition against transaction
async function evaluateRuleCondition(rule: any, transaction: any): Promise<boolean> {
  const condition = rule.condition;
  const type = rule.type;

  switch (type) {
    case 'high_value':
      // Amount exceeds threshold
      const threshold = condition.threshold || 500000;
      return transaction.amount > threshold;

    case 'multiple_failures':
      // Check for multiple failed attempts before success
      const maxAttempts = condition.maxAttempts || 3;
      const timeWindow = condition.timeWindow || 3600000; // 1 hour default
      // Implementation would check recent failed transactions
      // For now, return false as placeholder
      console.log(`Multiple failures check - maxAttempts: ${maxAttempts}, timeWindow: ${timeWindow}`);
      return false;

    case 'ip_country':
      // Check if IP country doesn't match expected
      const allowedCountries = condition.allowedCountries || ['Malawi'];
      // Implementation would check IP geolocation
      console.log(`IP country check - allowedCountries: ${allowedCountries.join(', ')}`);
      return false;

    case 'time_pattern':
      // Check if transaction time is unusual
      const unusualHours = condition.unusualHours || [0, 1, 2, 3, 4];
      const hour = new Date().getHours();
      return unusualHours.includes(hour);

    case 'amount_velocity':
      // Check for rapid high-value transactions
      const velocityThreshold = condition.velocityThreshold || 1000000;
      const timeWindowMs = condition.timeWindow || 600000; // 10 minutes
      // Implementation would check recent transactions
      console.log(`Amount velocity check - threshold: ${velocityThreshold}, timeWindow: ${timeWindowMs}`);
      return false;

    default:
      return false;
  }
}

// Test a rule with sample data
export const testFraudRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { ruleId, sampleTransaction } = req.body;

    const rule = await prisma.fraudRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      res.status(404).json({ success: false, message: 'Rule not found' });
      return;
    }

    const isMatch = await evaluateRuleCondition(rule, sampleTransaction);

    res.status(200).json({
      success: true,
      data: {
        ruleName: rule.name,
        isMatch,
        condition: rule.condition,
        sampleTransaction,
        result: isMatch ? 'Rule triggered' : 'Rule did not trigger',
      },
    });
  } catch (error) {
    console.error('Test fraud rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to test rule' });
  }
};

// ==================== FLAGGED TRANSACTIONS ====================

// Get flagged transactions
export const getFlaggedTransactions = async (req: Request, res: Response): Promise<void> => {
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
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const severity = req.query.severity as string;
    const skip = (page - 1) * limit;

    const whereCondition: any = {};
    if (status && status !== 'all') whereCondition.status = status;
    if (severity && severity !== 'all') whereCondition.severity = severity;

    const [flagged, totalCount] = await Promise.all([
      prisma.flaggedTransaction.findMany({
        where: whereCondition,
        include: {
          transaction: {
            include: {
              merchant: { select: { businessName: true } },
              organizer: { select: { organizationName: true } },
            },
          },
          fraudRule: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.flaggedTransaction.count({ where: whereCondition }),
    ]);

    // Calculate fraud statistics
    const stats = await prisma.flaggedTransaction.groupBy({
      by: ['status', 'severity'],
      _count: true,
    });

    res.status(200).json({
      success: true,
      data: {
        flagged: flagged.map(f => ({
          id: f.id,
          transactionId: f.transactionId,
          transactionRef: f.transaction?.transactionRef,
          amount: f.transaction?.amount,
          reason: f.reason,
          severity: f.severity,
          status: f.status,
          score: f.score,
          ruleName: f.fraudRule?.name,
          merchant: f.transaction?.merchant?.businessName,
          organizer: f.transaction?.organizer?.organizationName,
          createdAt: f.createdAt,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
        stats: {
          total: totalCount,
          pending: stats.filter(s => s.status === 'pending').reduce((sum, s) => sum + s._count, 0),
          reviewed: stats.filter(s => s.status === 'reviewed').reduce((sum, s) => sum + s._count, 0),
          confirmed: stats.filter(s => s.status === 'confirmed_fraud').reduce((sum, s) => sum + s._count, 0),
          falsePositive: stats.filter(s => s.status === 'false_positive').reduce((sum, s) => sum + s._count, 0),
          bySeverity: {
            low: stats.filter(s => s.severity === 'low').reduce((sum, s) => sum + s._count, 0),
            medium: stats.filter(s => s.severity === 'medium').reduce((sum, s) => sum + s._count, 0),
            high: stats.filter(s => s.severity === 'high').reduce((sum, s) => sum + s._count, 0),
            critical: stats.filter(s => s.severity === 'critical').reduce((sum, s) => sum + s._count, 0),
          },
        },
      },
    });
  } catch (error) {
    console.error('Get flagged transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flagged transactions' });
  }
};

// Review a flagged transaction
export const reviewFlaggedTransaction = async (req: Request, res: Response): Promise<void> => {
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
    const { status, notes } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: 'Status is required' });
      return;
    }

    const flagged = await prisma.flaggedTransaction.update({
      where: { id },
      data: {
        status,
        notes,
        reviewedBy: user.email,
        reviewedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `Flagged transaction marked as ${status}`,
      data: flagged,
    });
  } catch (error) {
    console.error('Review flagged transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to review flagged transaction' });
  }
};

// ==================== FRAUD ALERTS ====================

// Get fraud alerts
export const getFraudAlerts = async (req: Request, res: Response): Promise<void> => {
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
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const whereCondition: any = {};
    if (status && status !== 'all') whereCondition.status = status;

    const [alerts, totalCount] = await Promise.all([
      prisma.fraudAlert.findMany({
        where: whereCondition,
        include: { fraudRule: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fraudAlert.count({ where: whereCondition }),
    ]);

    const unreadCount = await prisma.fraudAlert.count({
      where: { status: 'new' },
    });

    res.status(200).json({
      success: true,
      data: {
        alerts,
        unreadCount,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error('Get fraud alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fraud alerts' });
  }
};

// Acknowledge a fraud alert
export const acknowledgeAlert = async (req: Request, res: Response): Promise<void> => {
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

    const alert = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: 'acknowledged',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Alert acknowledged',
      data: alert,
    });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to acknowledge alert' });
  }
};

// Resolve a fraud alert
export const resolveAlert = async (req: Request, res: Response): Promise<void> => {
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
    const { resolution } = req.body;

    const alert = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: user.email,
      },
    });

    // Log resolution if provided
    if (resolution) {
      console.log(`Alert ${id} resolved with resolution: ${resolution}`);
    }

    res.status(200).json({
      success: true,
      message: 'Alert resolved',
      data: alert,
    });
  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve alert' });
  }
};
// ==================== UTILITIES ====================

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

    rulesCache.clear();
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

    const [rules, flagged, alerts, stats] = await Promise.all([
      prisma.fraudRule.count(),
      prisma.flaggedTransaction.count(),
      prisma.fraudAlert.count({ where: { status: 'new' } }),
      prisma.flaggedTransaction.groupBy({
        by: ['severity'],
        _count: true,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('Get fraud dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fraud dashboard' });
  }
};