// routes/qrcode.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  regenerateEventQRCodes,
  regenerateTicketQRCode,
  generateRoleSpecificQRCodes,
  getDeliveryStatus,
  queueBulkEmails,
} from '../controllers/qrcode.controller';

const router: Router = Router();

// Apply authentication to all QR code routes
router.use(authenticate);

// POST /api/organizer/qrcodes/regenerate - Regenerate all QR codes for event
router.post('/qrcodes/regenerate/:eventId', regenerateEventQRCodes);

// POST /api/organizer/qrcodes/regenerate/ticket/:ticketId - Regenerate single ticket QR code
router.post('/qrcodes/regenerate/ticket/:ticketId', regenerateTicketQRCode);

// POST /api/organizer/qrcodes/role-specific/:eventId - Generate role-specific QR codes
router.post('/qrcodes/role-specific/:eventId', generateRoleSpecificQRCodes);

// GET /api/organizer/qrcodes/delivery-status/:eventId - Get email delivery status
router.get('/qrcodes/delivery-status/:eventId', getDeliveryStatus);

// POST /api/organizer/qrcodes/bulk-email/:eventId - Queue bulk emails
router.post('/qrcodes/bulk-email/:eventId', queueBulkEmails);

export default router;