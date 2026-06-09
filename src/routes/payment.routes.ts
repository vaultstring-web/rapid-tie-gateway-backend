import { Router } from 'express';
import { initiatePayment, handlePaymentWebhook, getPaymentStatus } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';

import { verifyWebhookSignature } from '../middlewares/webhook.middleware';
const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Payment route working!' });
});

// ✅ Add authentication to initiate payment
router.post('/initiate', authenticate, initiatePayment);

// Webhook endpoint for payment providers (NO auth - external providers call this)
router.post('/webhook/:provider', handlePaymentWebhook);
// Webhook endpoint for payment providers
router.post('/webhook/:provider', (req, res, next) => verifyWebhookSignature(req.params.provider)(req, res, next), handlePaymentWebhook);

// ✅ Add authentication to get payment status
router.get('/status/:sessionToken', authenticate, getPaymentStatus);

export default router;