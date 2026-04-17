// routes/universal.routes.ts
import { Router } from 'express';
import { 
  getUniversalEvents, 
  clearUniversalCache,
  getTrendingEvents 
} from '../controllers/universal.controller';

const router: Router = Router();

// GET /api/events/universal - Personalized event feed
router.get('/universal', getUniversalEvents);

// GET /api/events/universal/trending - Trending events
router.get('/universal/trending', getTrendingEvents);

// DELETE /api/events/universal/cache - Clear cache (admin/organizer)
router.delete('/universal/cache', clearUniversalCache);

export default router;