// services/jobQueue.service.ts
import Queue from 'bull';
import { prisma } from '../server';

// Define job queues
export const emailQueue = new Queue('email', process.env.REDIS_URL || 'redis://localhost:6379');
export const notificationQueue = new Queue('notification', process.env.REDIS_URL || 'redis://localhost:6379');
export const reminderQueue = new Queue('reminder', process.env.REDIS_URL || 'redis://localhost:6379');
export const reportQueue = new Queue('report', process.env.REDIS_URL || 'redis://localhost:6379');
export const cleanupQueue = new Queue('cleanup', process.env.REDIS_URL || 'redis://localhost:6379');

// Email job processor
emailQueue.process(async (job) => {
  const { to, subject } = job.data;
  console.log(`📧 Processing email to ${to}: ${subject}`);
  // Actual email sending logic here
  return { success: true, messageId: `msg_${Date.now()}` };
});

// Notification job processor
notificationQueue.process(async (job) => {
  const { userId, title } = job.data;
  console.log(`🔔 Processing notification for user ${userId}: ${title}`);
  // Actual notification logic here
  return { success: true, notificationId: `notif_${Date.now()}` };
});

// Reminder job processor
reminderQueue.process(async (job) => {
  const { eventId, userId, daysUntil } = job.data;
  console.log(`⏰ Processing reminder for event ${eventId}, user ${userId}, ${daysUntil} days until event`);
  // Actual reminder logic here
  return { success: true };
});

// Report job processor
reportQueue.process(async (job) => {
  const { reportType, format } = job.data;
  console.log(`📊 Generating ${reportType} report in ${format} format`);
  // Actual report generation logic here
  return { success: true, reportUrl: `/reports/${reportType}_${Date.now()}.${format}` };
});

// Cleanup job processor
cleanupQueue.process(async (job) => {
  const { olderThan, type } = job.data;
  console.log(`🧹 Cleaning up ${type} older than ${olderThan} days`);
  
  if (type === 'logs') {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThan);
    await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
  }
  
  return { success: true, deletedCount: 0 };
});

// Add job to queue
export async function addEmailJob(to: string, subject: string, content: string, _data?: any) {
  return await emailQueue.add({ to, subject, content, data: _data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
  });
}

export async function addNotificationJob(userId: string, title: string, message: string, _type: string) {
  return await notificationQueue.add({ userId, title, message, type: _type }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function addReminderJob(eventId: string, userId: string, daysUntil: number) {
  const delay = daysUntil === 1 ? 24 * 60 * 60 * 1000 : (daysUntil - 1) * 24 * 60 * 60 * 1000;
  return await reminderQueue.add({ eventId, userId, daysUntil }, {
    delay,
    attempts: 2,
  });
}

export async function addReportJob(reportType: string, format: string, _filters?: any) {
  return await reportQueue.add({ reportType, format, filters: _filters }, {
    attempts: 2,
    removeOnComplete: true,
  });
}

// Schedule recurring jobs
export async function scheduleRecurringJobs() {
  // Daily cleanup job at 2 AM
  await cleanupQueue.add({ olderThan: 30, type: 'logs' }, {
    repeat: { cron: '0 2 * * *' },
    jobId: 'daily-cleanup',
  });
  
  // Hourly reminder check
  await reminderQueue.add({ check: true }, {
    repeat: { cron: '0 * * * *' },
    jobId: 'hourly-reminders',
  });
  
  console.log('✅ Scheduled recurring jobs');
}