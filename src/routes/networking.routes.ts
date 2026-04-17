// routes/networking.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  getNetworkingSuggestions,
  updateNetworkingProfile,
  sendConnectionRequest,
  respondToConnection,
  sendMessage,
  getMessages,
  getConnections
} from '../controllers/networking.controller';

const router: Router = Router();

// Apply authentication to all networking routes
router.use(authenticate);

// GET /api/events/networking - Get networking suggestions
router.get('/networking', getNetworkingSuggestions);

// POST /api/events/networking/profile - Update networking profile
router.post('/networking/profile', updateNetworkingProfile);

// POST /api/events/networking/connect - Send connection request
router.post('/networking/connect', sendConnectionRequest);

// POST /api/events/networking/respond - Respond to connection request
router.post('/networking/respond', respondToConnection);

// POST /api/events/networking/message - Send message
router.post('/networking/messages', sendMessage);

// GET /api/events/networking/messages - Get messages
router.get('/networking/messages', getMessages);

// GET /api/events/networking/connections - Get user's connections
router.get('/networking/connections', getConnections);

export default router;