import { Queue, Worker } from 'bullmq';
import { prisma } from '../server';
import { logger } from '../utils/logger';
import { notifyQueueFailure, notifyQueueConnectionFailure } from '../utils/alerting';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Settlement queue configuration
const settlementQueue = new Queue('settlement', {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 seconds initial delay
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

interface SettlementJobData {
  periodStart: Date;
  periodEnd: Date;
  entity: 'merchant' | 'organizer' | 'all';
  requestedBy?: string;
}

/**
 * Process settlement job
 */
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
      const agg = await prisma.transaction.aggregate({
        where: {
          merchantId: merchant.id,
          status: 'SUCCESS',
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
          status: 'PENDING',
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
      const agg = await prisma.transaction.aggregate({
        where: {
          organizerId: organizer.id,
          status: 'SUCCESS',
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
          status: 'PENDING',
        },
      });

      created.push(settlement);
    }
  }

  logger.info(`Created ${created.length} settlement records`);
  return { success: true, createdCount: created.length };
}

// ✅ Register worker with error handlers
const worker = new Worker('settlement', async (job) => {
  const data = job.data as SettlementJobData;
  return await processSettlement(data);
}, {
  connection: redisConfig,
  concurrency: 1,
});

// ✅ Failed event handler - logs job data, error stack, attempts
worker.on('failed', async (job, error) => {
  if (!job) return;
  
  const attemptsMade = job.attemptsMade || 0;
  const maxAttempts = job.opts?.attempts || 3;
  
  // Only notify on final attempt failure
  if (attemptsMade >= maxAttempts) {
    await notifyQueueFailure(
      'settlement',
      job.id!,
      error,
      attemptsMade,
      job.data
    );
  } else {
    // Log but don't alert for retries
    logger.warn(`⚠️ Settlement job ${job.id} failed, retry ${attemptsMade}/${maxAttempts}: ${error.message}`);
  }
});

// ✅ Completed event handler for monitoring
worker.on('completed', (job) => {
  logger.info(`✅ Settlement job ${job.id} completed successfully`);
});

// ✅ Error event handler for queue connection failures
worker.on('error', async (error) => {
  await notifyQueueConnectionFailure('settlement', error);
});

// Queue-level error handler
settlementQueue.on('error', async (error) => {
  await notifyQueueConnectionFailure('settlement (queue)', error);
});

// ✅ Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  await settlementQueue.close();
  logger.info('Settlement worker and queue closed');
});

export { settlementQueue, processSettlement, worker };