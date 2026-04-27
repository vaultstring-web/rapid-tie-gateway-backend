import { Request, Response } from 'express';
import { prisma } from '../../server';
import { settlementQueue } from '../../services/settlementQueue.service';

function requireAdmin(req: Request, res: Response): { ok: true; user: any } | { ok: false } {
  const user = (req as any).user;
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    return { ok: false };
  }
  return { ok: true, user };
}

export const listSettlements = async (req: Request, res: Response): Promise<void> => {
  const guard = requireAdmin(req, res);
  if (!guard.ok) return;

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = (req.query.status as string) || undefined;
    const entity = (req.query.entity as string) || 'merchant'; // merchant | organizer | all

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (entity === 'merchant') where.merchantId = { not: null };
    if (entity === 'organizer') where.organizerId = { not: null };

    const [items, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          merchant: { select: { id: true, businessName: true } },
          organizer: { select: { id: true, organizationName: true } },
        },
      }),
      prisma.settlement.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        settlements: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('List settlements error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settlements' });
  }
};

export const runSettlement = async (req: Request, res: Response): Promise<void> => {
  const guard = requireAdmin(req, res);
  if (!guard.ok) return;

  try {
    const { periodStart, periodEnd, entity = 'merchant' } = req.body || {};

    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = periodEnd ? new Date(periodEnd) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      res.status(400).json({ success: false, message: 'Invalid periodStart/periodEnd' });
      return;
    }

    const job = await settlementQueue.add(
      'run-settlement',
      {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        entity,
        requestedBy: guard.user.email,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true }
    );

    res.status(202).json({
      success: true,
      message: 'Settlement run queued',
      data: { jobId: job.id, periodStart: start.toISOString(), periodEnd: end.toISOString(), entity },
    });
  } catch (error) {
    console.error('Run settlement error:', error);
    res.status(500).json({ success: false, message: 'Failed to queue settlement run' });
  }
};

export const getReconciliationExceptions = async (req: Request, res: Response): Promise<void> => {
  const guard = requireAdmin(req, res);
  if (!guard.ok) return;

  try {
    const sinceHours = parseInt(req.query.sinceHours as string) || 72;
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    // Minimal first-pass reconciliation: detect "success" transactions missing providerRef,
    // and failed transactions that still have a providerRef (often indicates inconsistent state).
    const [missingProviderRef, inconsistentFailed] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          status: 'success',
          createdAt: { gte: since },
          OR: [{ providerRef: null }, { providerRef: '' }],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.transaction.findMany({
        where: {
          status: 'failed',
          createdAt: { gte: since },
          NOT: [{ providerRef: null }, { providerRef: '' }],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        since: since.toISOString(),
        counts: {
          missingProviderRef: missingProviderRef.length,
          inconsistentFailed: inconsistentFailed.length,
        },
        exceptions: {
          missingProviderRef,
          inconsistentFailed,
        },
      },
    });
  } catch (error) {
    console.error('Reconciliation exceptions error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute reconciliation exceptions' });
  }
};

