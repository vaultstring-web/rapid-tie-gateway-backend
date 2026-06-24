import Queue, { Job, Queue as QueueType } from 'bull';
import { prisma } from '../server';
import { logger } from '../utils/logger';
import { notifyQueueFailure, notifyQueueConnectionFailure } from '../utils/alerting';

// Redis connection URL
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Define job queues
export const emailQueue = new Queue('email', REDIS_URL);
export const notificationQueue = new Queue('notification', REDIS_URL);
export const reminderQueue = new Queue('reminder', REDIS_URL);
export const reportQueue = new Queue('report', REDIS_URL);
export const cleanupQueue = new Queue('cleanup', REDIS_URL);

// Default job options
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false, // Keep failed jobs for debugging
};

// ======================
// Queue Error Handlers
// ======================

function setupQueueErrorHandlers(queue: QueueType, queueName: string) {
  // ✅ Error event handler for queue-level connection failures
  queue.on('error', (error: Error) => {
    notifyQueueConnectionFailure(queueName, error);
  });

  // ✅ Failed event handler for individual jobs
  queue.on('failed', (job: Job | undefined, error: Error) => {
    if (!job) return;
    
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || 3;
    
    // Only notify on final attempt failure
    if (attemptsMade >= maxAttempts) {
      notifyQueueFailure(
        queueName,
        job.id!,
        error,
        attemptsMade,
        job.data
      );
    } else {
      logger.warn(`⚠️ ${queueName} job ${job.id} failed, retry ${attemptsMade}/${maxAttempts}: ${error.message}`);
    }
  });

  // ✅ Completed event for monitoring
  queue.on('completed', (job: Job) => {
    logger.info(`✅ ${queueName} job ${job.id} completed successfully`);
  });

  // ✅ Stalled event
  queue.on('stalled', (job: Job) => {
    logger.warn(`⚠️ ${queueName} job ${job.id} stalled`);
  });
}

// Apply handlers to all queues
setupQueueErrorHandlers(emailQueue, 'email');
setupQueueErrorHandlers(notificationQueue, 'notification');
setupQueueErrorHandlers(reminderQueue, 'reminder');
setupQueueErrorHandlers(reportQueue, 'report');
setupQueueErrorHandlers(cleanupQueue, 'cleanup');

// ======================
// Job Processors
// ======================

// Email job processor
emailQueue.process(async (job: Job) => {
  const { to, subject } = job.data;
  logger.info(`📧 Processing email to ${to}: ${subject}`);
  // Actual email sending logic here
  return { success: true, messageId: `msg_${Date.now()}` };
});

// Notification job processor
notificationQueue.process(async (job: Job) => {
  const { userId, title } = job.data;
  logger.info(`🔔 Processing notification for user ${userId}: ${title}`);
  // Actual notification logic here
  return { success: true, notificationId: `notif_${Date.now()}` };
});

// Reminder job processor
reminderQueue.process(async (job: Job) => {
  const { eventId, userId, daysUntil } = job.data;
  logger.info(`⏰ Processing reminder for event ${eventId}, user ${userId}, ${daysUntil} days until event`);
  // Actual reminder logic here
  return { success: true };
});

// Report job processor
reportQueue.process(async (job: Job) => {
  const { reportType, format } = job.data;
  logger.info(`📊 Generating ${reportType} report in ${format} format`);
  // Actual report generation logic here
  return { success: true, reportUrl: `/reports/${reportType}_${Date.now()}.${format}` };
});

// Cleanup job processor
cleanupQueue.process(async (job: Job) => {
  const { olderThan, type } = job.data;
  logger.info(`🧹 Cleaning up ${type} older than ${olderThan} days`);
  
  if (type === 'logs') {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThan);
    await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
  }
  
  return { success: true, deletedCount: 0 };
});

// ======================
// Job Queue Functions
// ======================

export async function addEmailJob(to: string, subject: string, content: string, _data?: any) {
  return await emailQueue.add(
    { to, subject, content, data: _data },
    { ...defaultJobOptions, removeOnComplete: true }
  );
}

export async function addNotificationJob(userId: string, title: string, message: string, _type: string) {
  return await notificationQueue.add(
    { userId, title, message, type: _type },
    { ...defaultJobOptions, removeOnComplete: true }
  );
}

export async function addReminderJob(eventId: string, userId: string, daysUntil: number) {
  const delay = daysUntil === 1 ? 24 * 60 * 60 * 1000 : (daysUntil - 1) * 24 * 60 * 60 * 1000;
  return await reminderQueue.add(
    { eventId, userId, daysUntil },
    {
      ...defaultJobOptions,
      delay,
      attempts: 2,
    }
  );
}

export async function addReportJob(reportType: string, format: string, _filters?: any) {
  return await reportQueue.add(
    { reportType, format, filters: _filters },
    { ...defaultJobOptions, removeOnComplete: true }
  );
}

// ======================
// Schedule Recurring Jobs
// ======================

export async function scheduleRecurringJobs() {
  // Daily cleanup job at 2 AM
  await cleanupQueue.add(
    { olderThan: 30, type: 'logs' },
    {
      repeat: { cron: '0 2 * * *' },
      jobId: 'daily-cleanup',
      ...defaultJobOptions,
    }
  );
  
  // Hourly reminder check
  await reminderQueue.add(
    { check: true },
    {
      repeat: { cron: '0 * * * *' },
      jobId: 'hourly-reminders',
      ...defaultJobOptions,
    }
  );
  
  logger.info('✅ Scheduled recurring jobs');
}

process.on('SIGTERM', async () => {
  await Promise.all([
    emailQueue.close(),
    notificationQueue.close(),
    reminderQueue.close(),
    reportQueue.close(),
    cleanupQueue.close(),
  ]);
  logger.info('All queues closed');
});