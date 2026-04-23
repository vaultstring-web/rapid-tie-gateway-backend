// controllers/admin/transactionMonitor.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../../server';

// Store active WebSocket connections for transaction monitoring
const activeConnections = new Map<string, any>();
let transactionHistory: any[] = [];
const MAX_HISTORY = 100;

// Cache for transaction metrics
const metricsCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 5 * 1000; // 5 seconds

// Get transaction statistics
export const getTransactionStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'transaction_stats';
    const cached = metricsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, todayStats, weekStats, monthStats, pending, failed, byMethod, byStatus] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { createdAt: { gte: today } } }),
      prisma.transaction.count({ where: { createdAt: { gte: thisWeek } } }),
      prisma.transaction.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.transaction.count({ where: { status: 'pending' } }),
      prisma.transaction.count({ where: { status: 'failed' } }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    const recentTransactions = await prisma.transaction.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: { select: { businessName: true } },
        organizer: { select: { organizationName: true } },
      },
    });

    const response = {
      timestamp: now.toISOString(),
      summary: {
        total,
        today: todayStats,
        week: weekStats,
        month: monthStats,
        pending,
        failed,
        successRate: total > 0 ? ((total - failed) / total * 100).toFixed(1) : '100',
      },
      byPaymentMethod: byMethod.map(m => ({ method: m.paymentMethod, count: m._count })),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        transactionRef: t.transactionRef,
        amount: t.amount,
        status: t.status,
        paymentMethod: t.paymentMethod,
        provider: t.provider,
        createdAt: t.createdAt,
        merchant: t.merchant?.businessName,
        organizer: t.organizer?.organizationName,
      })),
    };

    metricsCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_DURATION });

    res.status(200).json({ success: true, data: response, cached: false });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction stats' });
  }
};

// Get suspicious transactions
export const getSuspiciousTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const suspicious = await prisma.transaction.findMany({
      where: {
        OR: [
          { status: 'failed' },
          { amount: { gt: 1000000 } }, // Large transactions
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        merchant: { select: { businessName: true } },
        organizer: { select: { organizationName: true } },
      },
    });

    res.status(200).json({
      success: true,
      data: suspicious.map(t => ({
        id: t.id,
        transactionRef: t.transactionRef,
        amount: t.amount,
        status: t.status,
        paymentMethod: t.paymentMethod,
        provider: t.provider,
        createdAt: t.createdAt,
        merchant: t.merchant?.businessName,
        organizer: t.organizer?.organizationName,
        reason: t.status === 'failed' ? 'Failed transaction' : 'High value transaction',
      })),
    });
  } catch (error) {
    console.error('Get suspicious transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch suspicious transactions' });
  }
};

// Get transaction details
export const getTransactionDetails = async (req: Request, res: Response): Promise<void> => {
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

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        merchant: true,
        organizer: true,
        refunds: true,
        auditLogs: true,
      },
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: 'Transaction not found' });
      return;
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    console.error('Get transaction details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction details' });
  }
};

// Manual intervention - refund transaction
export const refundTransaction = async (req: Request, res: Response): Promise<void> => {
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
    const { reason, amount } = req.body;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: 'Transaction not found' });
      return;
    }

    if (transaction.status !== 'success') {
      res.status(400).json({ success: false, message: 'Only successful transactions can be refunded' });
      return;
    }

    const refundAmount = amount || transaction.amount;

    const refund = await prisma.refund.create({
      data: {
        transactionId: transaction.id,
        amount: refundAmount,
        reason: reason || 'Manual refund by admin',
        status: 'completed',
        providerRef: `REF_${Date.now()}`,
      },
    });

    await prisma.transaction.update({
      where: { id },
      data: { status: 'refunded' },
    });

    // Broadcast refund event to WebSocket
    broadcastToMonitors('refund', {
      transactionId: transaction.id,
      transactionRef: transaction.transactionRef,
      refundAmount,
      reason,
      refundedBy: user.email,
      timestamp: new Date().toISOString(),
    });

    // Log the action - FIXED: using correct AuditLog fields
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        transactionId: transaction.id,
        action: 'MANUAL_REFUND',
        status: 'success',
        details: { refundAmount, reason, refundedBy: user.email },
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: `Transaction refunded successfully`,
      data: refund,
    });
  } catch (error) {
    console.error('Refund transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to refund transaction' });
  }
};

// Manual intervention - mark as failed
export const markTransactionAsFailed = async (req: Request, res: Response): Promise<void> => {
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

    const transaction = await prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: 'Transaction not found' });
      return;
    }

    if (transaction.status !== 'pending') {
      res.status(400).json({ success: false, message: 'Only pending transactions can be marked as failed' });
      return;
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: 'failed',
        metadata: { ...(transaction.metadata as any), failedReason: reason, failedBy: user.email },
      },
    });

    // Broadcast failure event to WebSocket
    broadcastToMonitors('manual_fail', {
      transactionId: transaction.id,
      transactionRef: transaction.transactionRef,
      reason,
      failedBy: user.email,
      timestamp: new Date().toISOString(),
    });

    // Log the action - FIXED: using correct AuditLog fields
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        transactionId: transaction.id,
        action: 'MANUAL_FAIL',
        status: 'success',
        details: { reason, failedBy: user.email },
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: `Transaction marked as failed`,
      data: updated,
    });
  } catch (error) {
    console.error('Mark transaction as failed error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark transaction' });
  }
};

// Manual intervention - approve transaction
export const approveTransaction = async (req: Request, res: Response): Promise<void> => {
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
    const { notes } = req.body;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: 'Transaction not found' });
      return;
    }

    if (transaction.status !== 'pending') {
      res.status(400).json({ success: false, message: 'Only pending transactions can be approved' });
      return;
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: 'success',
        metadata: { ...(transaction.metadata as any), approvedBy: user.email, approvalNotes: notes },
      },
    });

    // Broadcast approval event to WebSocket
    broadcastToMonitors('manual_approve', {
      transactionId: transaction.id,
      transactionRef: transaction.transactionRef,
      approvedBy: user.email,
      timestamp: new Date().toISOString(),
    });

    // Log the action - FIXED: using correct AuditLog fields
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        transactionId: transaction.id,
        action: 'MANUAL_APPROVE',
        status: 'success',
        details: { approvedBy: user.email, notes },
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: `Transaction approved successfully`,
      data: updated,
    });
  } catch (error) {
    console.error('Approve transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve transaction' });
  }
};

// Get event-related transactions
export const getEventTransactions = async (req: Request, res: Response): Promise<void> => {
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

    const transactions = await prisma.transaction.findMany({
      where: {
        metadata: {
          path: ['eventId'],
          equals: eventId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        organizer: { select: { organizationName: true } },
      },
    });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { name: true },
    });

    res.status(200).json({
      success: true,
      data: {
        eventId,
        eventName: event?.name,
        totalTransactions: transactions.length,
        totalRevenue: transactions.reduce((sum, t) => sum + t.amount, 0),
        transactions: transactions.map(t => ({
          id: t.id,
          transactionRef: t.transactionRef,
          amount: t.amount,
          status: t.status,
          paymentMethod: t.paymentMethod,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get event transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch event transactions' });
  }
};

// WebSocket functions
export const addMonitorConnection = (socketId: string, socket: any) => {
  activeConnections.set(socketId, socket);
  console.log(`Transaction monitor connected: ${socketId}, Total: ${activeConnections.size}`);
};

export const removeMonitorConnection = (socketId: string) => {
  activeConnections.delete(socketId);
  console.log(`Transaction monitor disconnected: ${socketId}, Total: ${activeConnections.size}`);
};

export const broadcastToMonitors = (event: string, data: any) => {
  const message = { event, data, timestamp: new Date().toISOString() };
  
  for (const [socketId, socket] of activeConnections) {
    try {
      socket.emit('transaction-event', message);
    } catch (error) {
      console.error(`Failed to send to ${socketId}:`, error);
      activeConnections.delete(socketId);
    }
  }
};

// Add transaction to history and broadcast
export const addTransactionToHistory = (transaction: any) => {
  transactionHistory.unshift(transaction);
  if (transactionHistory.length > MAX_HISTORY) {
    transactionHistory.pop();
  }
  
  broadcastToMonitors('new_transaction', transaction);
};

// Get transaction history
export const getTransactionHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        history: transactionHistory.slice(0, 50),
        total: transactionHistory.length,
      },
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
};

// Clear transaction cache
export const clearTransactionCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    metricsCache.clear();
    res.status(200).json({
      success: true,
      message: 'Transaction cache cleared',
    });
  } catch (error) {
    console.error('Clear transaction cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};