// routes/admin/jobManagement.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { 
  getAllJobQueues,
  getFailedJobs,
  retryJob,
  retryAllFailedJobs,
  cancelJob,
  clearQueue,
  getJobDetails,
  scheduleRecurringJob,
  clearJobCache,
  addImmediateJob,
} from '../../controllers/admin/jobManagement.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// GET /api/admin/jobs - List all job queues
router.get('/jobs', getAllJobQueues);

// GET /api/admin/jobs/:queueName/failed - Get failed jobs
router.get('/jobs/:queueName/failed', getFailedJobs);

// GET /api/admin/jobs/:queueName/job - Get job details (using query param ?jobId=xxx)
router.get('/jobs/:queueName/job', getJobDetails);

// POST /api/admin/jobs/:queueName/job/retry - Retry a failed job (using query param ?jobId=xxx)
router.post('/jobs/:queueName/job/retry', retryJob);

// POST /api/admin/jobs/:queueName/retry-all - Retry all failed jobs
router.post('/jobs/:queueName/retry-all', retryAllFailedJobs);

// DELETE /api/admin/jobs/:queueName/job/cancel - Cancel a job (using query param ?jobId=xxx)
router.delete('/jobs/:queueName/job/cancel', cancelJob);

// DELETE /api/admin/jobs/:queueName/clear - Clear all jobs in queue
router.delete('/jobs/:queueName/clear', clearQueue);

// POST /api/admin/jobs/schedule - Schedule a recurring job
router.post('/jobs/schedule', scheduleRecurringJob);

// POST /api/admin/jobs/ immediate - Add an immediate job
router.post('/jobs/ immediate', addImmediateJob);


// DELETE /api/admin/jobs/cache - Clear job cache
router.delete('/jobs/cache', clearJobCache);

export default router;