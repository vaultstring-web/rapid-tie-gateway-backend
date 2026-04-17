// routes/analytics.routes.ts
import { Router } from 'express';
import { getEventAnalytics, getEventAnalyticsById } from '../controllers/analytics.controller';

const router: Router = Router();

// GET /api/analytics/events - Cross-platform event analytics
router.get('/events', getEventAnalytics);

// GET /api/analytics/events/:id - Single event analytics
router.get('/events/:id', getEventAnalyticsById);

export default router;