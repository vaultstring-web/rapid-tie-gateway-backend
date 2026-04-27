import Queue from 'bull';
import { prisma } from '../server';

export const settlementQueue = new Queue('settlement', process.env.REDIS_URL || 'redis://localhost:6379');

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

settlementQueue.process(async (job) => {
  const { periodStart, periodEnd, entity } = job.data as {
    periodStart: string;
    periodEnd: string;
    entity: 'merchant' | 'organizer' | 'all';
    requestedBy?: string;
  };

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const includeMerchants = entity === 'merchant' || entity === 'all';
  const includeOrganizers = entity === 'organizer' || entity === 'all';

  const created: any[] = [];

  if (includeMerchants) {
    const merchants = await prisma.merchant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, feePercentage: true } });

    for (const merchant of merchants) {
      const settlementRef = `SET-M-${merchant.id}-${dayKey(start)}-${dayKey(end)}`;

      const existing = await prisma.settlement.findFirst({
        where: { merchantId: merchant.id, periodStart: start, periodEnd: end },
        select: { id: true },
      });
      if (existing) continue;

      const agg = await prisma.transaction.aggregate({
        where: {
          merchantId: merchant.id,
          status: 'success',
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true, fee: true, netAmount: true },
        _count: { _all: true },
      });

      const grossAmount = agg._sum.amount || 0;
      const feeAmount = agg._sum.fee || 0;
      const netAmount = agg._sum.netAmount || Math.max(0, grossAmount - feeAmount);
      const transactionCount = agg._count._all || 0;

      if (transactionCount === 0) continue;

      const settlement = await prisma.settlement.create({
        data: {
          merchantId: merchant.id,
          settlementRef,
          periodStart: start,
          periodEnd: end,
          grossAmount,
          feeAmount,
          netAmount,
          transactionCount,
          status: 'pending',
          bankReference: null,
          settledAt: null,
        },
      });

      created.push(settlement);
    }
  }

  if (includeOrganizers) {
    const organizers = await prisma.eventOrganizer.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const organizer of organizers) {
      const settlementRef = `SET-O-${organizer.id}-${dayKey(start)}-${dayKey(end)}`;

      const existing = await prisma.settlement.findFirst({
        where: { organizerId: organizer.id, periodStart: start, periodEnd: end },
        select: { id: true },
      });
      if (existing) continue;

      const agg = await prisma.transaction.aggregate({
        where: {
          organizerId: organizer.id,
          status: 'success',
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true, fee: true, netAmount: true },
        _count: { _all: true },
      });

      const grossAmount = agg._sum.amount || 0;
      const feeAmount = agg._sum.fee || 0;
      const netAmount = agg._sum.netAmount || Math.max(0, grossAmount - feeAmount);
      const transactionCount = agg._count._all || 0;

      if (transactionCount === 0) continue;

      const settlement = await prisma.settlement.create({
        data: {
          organizerId: organizer.id,
          settlementRef,
          periodStart: start,
          periodEnd: end,
          grossAmount,
          feeAmount,
          netAmount,
          transactionCount,
          status: 'pending',
          bankReference: null,
          settledAt: null,
        },
      });

      created.push(settlement);
    }
  }

  return { success: true, createdCount: created.length };
});

