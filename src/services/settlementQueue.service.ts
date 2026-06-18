// src/services/settlementQueue.service.ts
import { Queue } from 'bullmq';
import { prisma } from '../server';
import { logger } from '../utils/logger';

// Settlement queue configuration
const settlementQueue = new Queue('settlement', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

interface SettlementJobData {
  periodStart: Date;
  periodEnd: Date;
  entity: 'merchant' | 'organizer' | 'all';
  requestedBy?: string;
}

async function processSettlement(data: SettlementJobData) {
  const { periodStart, periodEnd, entity } = data;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  logger.info(`Processing settlement for period ${start.toISOString()} to ${end.toISOString()}`);

  const includeMerchants = entity === 'merchant' || entity === 'all';
  const includeOrganizers = entity === 'organizer' || entity === 'all';

  const created: any[] = [];

  if (includeMerchants) {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, feePercentage: true },
    });

    for (const merchant of merchants) {
      // This query will use @@index([merchantId, status, createdAt]) index
      const agg = await prisma.transaction.aggregate({
        where: {
          merchantId: merchant.id,
          status: 'success',
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true, fee: true, netAmount: true },
        _count: { _all: true },
      });

      const transactionCount = agg._count._all || 0;
      if (transactionCount === 0) continue;

      const settlementRef = `SET-M-${merchant.id}-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}`;

      const settlement = await prisma.settlement.create({
        data: {
          merchantId: merchant.id,
          settlementRef,
          periodStart: start,
          periodEnd: end,
          grossAmount: agg._sum.amount || 0,
          feeAmount: agg._sum.fee || 0,
          netAmount: agg._sum.netAmount || 0,
          transactionCount,
          status: 'pending',
        },
      });

      created.push(settlement);
    }
  }

  if (includeOrganizers) {
    const organizers = await prisma.eventOrganizer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const organizer of organizers) {
      // This query will use @@index([organizerId, status, createdAt]) index
      const agg = await prisma.transaction.aggregate({
        where: {
          organizerId: organizer.id,
          status: 'success',
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true, fee: true, netAmount: true },
        _count: { _all: true },
      });

      const transactionCount = agg._count._all || 0;
      if (transactionCount === 0) continue;

      const settlementRef = `SET-O-${organizer.id}-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}`;

      const settlement = await prisma.settlement.create({
        data: {
          organizerId: organizer.id,
          settlementRef,
          periodStart: start,
          periodEnd: end,
          grossAmount: agg._sum.amount || 0,
          feeAmount: agg._sum.fee || 0,
          netAmount: agg._sum.netAmount || 0,
          transactionCount,
          status: 'pending',
        },
      });

      created.push(settlement);
    }
  }

  logger.info(`Created ${created.length} settlement records`);
  return { success: true, createdCount: created.length };
}

// Process settlement jobs
settlementQueue.process(async (job) => {
  const data = job.data as SettlementJobData;
  return await processSettlement(data);
});

export { settlementQueue, processSettlement };