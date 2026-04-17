// routes/recommendations.routes.ts
import { Router } from 'express';
import { getRecommendedEvents, clearRecommendationsCache } from '../controllers/recommendations.controller';

const router: Router = Router();

// GET /api/events/recommended - Personalized event recommendations
router.get('/recommended', getRecommendedEvents);

// DELETE /api/events/recommended/cache - Clear recommendations cache
router.delete('/recommended/cache', clearRecommendationsCache);

export default router;