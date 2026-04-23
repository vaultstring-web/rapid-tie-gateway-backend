// controllers/admin/jobManagement.controller.ts
import { Request, Response } from 'express';
import { 
  emailQueue, 
  notificationQueue, 
  reminderQueue, 
  reportQueue, 
  cleanupQueue,
  scheduleRecurringJobs,
} from '../../services/jobQueue.service';

// Cache for job metrics
const jobCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 5 * 1000; // 5 seconds

// Get all job queues status
export const getAllJobQueues = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const cacheKey = 'job_queues';
    const cached = jobCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, data: cached.data, cached: true });
      return;
    }

    const [email, notification, reminder, report, cleanup] = await Promise.all([
      getQueueStats(emailQueue),
      getQueueStats(notificationQueue),
      getQueueStats(reminderQueue),
      getQueueStats(reportQueue),
      getQueueStats(cleanupQueue),
    ]);

    const queues = [
      { name: 'email', ...email },
      { name: 'notification', ...notification },
      { name: 'reminder', ...reminder },
      { name: 'report', ...report },
      { name: 'cleanup', ...cleanup },
    ];

    const totalJobs = queues.reduce((sum, q) => sum + q.waiting + q.active + q.completed + q.failed, 0);
    const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        totalQueues: queues.length,
        totalJobs,
        totalFailed,
        health: totalFailed > 100 ? 'critical' : totalFailed > 20 ? 'warning' : 'healthy',
      },
      queues,
    };

    jobCache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_DURATION });

    res.status(200).json({ success: true, data: response, cached: false });
  } catch (error) {
    console.error('Get job queues error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job queues' });
  }
};

// Helper to get queue stats
async function getQueueStats(queue: any) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

// Get failed jobs
export const getFailedJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    const failedJobs = await queue.getFailed();
    const start = (page - 1) * limit;
    const paginatedJobs = failedJobs.slice(start, start + limit);

    const formattedJobs = paginatedJobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      attempts: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));

    res.status(200).json({
      success: true,
      data: {
        jobs: formattedJobs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(failedJobs.length / limit),
          totalItems: failedJobs.length,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error('Get failed jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch failed jobs' });
  }
};

// Get job details (using query param)
export const getJobDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    const { jobId } = req.query;
    
    if (!jobId) {
      res.status(400).json({ success: false, message: 'Job ID is required' });
      return;
    }
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    const job = await queue.getJob(jobId as string);
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }

    const state = await job.getState();
    const progress = job.progress();
    const logs = await job.logs();

    res.status(200).json({
      success: true,
      data: {
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
        attempts: job.attemptsMade,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        state,
        progress,
        logs: logs.slice(-50),
      },
    });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job details' });
  }
};

// Retry a failed job (using query param)
export const retryJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    const { jobId } = req.query;
    
    if (!jobId) {
      res.status(400).json({ success: false, message: 'Job ID is required' });
      return;
    }
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    const job = await queue.getJob(jobId as string);
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }

    await job.retry();
    
    jobCache.clear();

    res.status(200).json({
      success: true,
      message: `Job ${jobId} retried successfully`,
    });
  } catch (error) {
    console.error('Retry job error:', error);
    res.status(500).json({ success: false, message: 'Failed to retry job' });
  }
};

// Retry all failed jobs in a queue
export const retryAllFailedJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    const failedJobs = await queue.getFailed();
    let retriedCount = 0;
    
    for (const job of failedJobs) {
      await job.retry();
      retriedCount++;
    }
    
    jobCache.clear();

    res.status(200).json({
      success: true,
      message: `${retriedCount} jobs retried successfully`,
      data: { retriedCount },
    });
  } catch (error) {
    console.error('Retry all jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to retry jobs' });
  }
};

// Cancel a job (using query param)
export const cancelJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    const { jobId } = req.query;
    
    if (!jobId) {
      res.status(400).json({ success: false, message: 'Job ID is required' });
      return;
    }
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    const job = await queue.getJob(jobId as string);
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }

    await job.remove();
    
    jobCache.clear();

    res.status(200).json({
      success: true,
      message: `Job ${jobId} cancelled successfully`,
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel job' });
  }
};

// Clear all jobs in a queue
export const clearQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { queueName } = req.params;
    
    let queue: any;
    switch (queueName) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid queue name' });
        return;
    }

    await queue.empty();
    
    jobCache.clear();

    res.status(200).json({
      success: true,
      message: `Queue ${queueName} cleared successfully`,
    });
  } catch (error) {
    console.error('Clear queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear queue' });
  }
};

// Schedule a new recurring job
export const scheduleRecurringJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { jobType, cron, data, name } = req.body;
    
    if (!jobType || !cron) {
      res.status(400).json({ success: false, message: 'Job type and cron expression are required' });
      return;
    }

    let queue: any;
    switch (jobType) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid job type' });
        return;
    }

    const job = await queue.add(data || {}, {
      repeat: { cron },
      jobId: name || `${jobType}_recurring_${Date.now()}`,
    });

    res.status(201).json({
      success: true,
      message: `Recurring job scheduled`,
      data: { jobId: job.id, cron, jobType },
    });
  } catch (error) {
    console.error('Schedule recurring job error:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule recurring job' });
  }
};

// Initialize recurring jobs on server start
export const initializeRecurringJobs = async () => {
  await scheduleRecurringJobs();
};

// Clear job cache
export const clearJobCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    jobCache.clear();
    res.status(200).json({
      success: true,
      message: 'Job cache cleared',
    });
  } catch (error) {
    console.error('Clear job cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
};
// Add an immediate job
export const addImmediateJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
      return;
    }

    const { jobType, data, name } = req.body;
    
    if (!jobType || !data) {
      res.status(400).json({ success: false, message: 'Job type and data are required' });
      return;
    }

    let queue: any;
    switch (jobType) {
      case 'email': queue = emailQueue; break;
      case 'notification': queue = notificationQueue; break;
      case 'reminder': queue = reminderQueue; break;
      case 'report': queue = reportQueue; break;
      case 'cleanup': queue = cleanupQueue; break;
      default:
        res.status(400).json({ success: false, message: 'Invalid job type' });
        return;
    }

    const job = await queue.add(data, {
      jobId: name || `${jobType}_immediate_${Date.now()}`,
      removeOnComplete: true,
    });

    res.status(201).json({
      success: true,
      message: `Immediate job added to ${jobType} queue`,
      data: { jobId: job.id, jobType },
    });
  } catch (error) {
    console.error('Add immediate job error:', error);
    res.status(500).json({ success: false, message: 'Failed to add job' });
  }
};