import { Router } from 'express';
import { initiatePayment, handlePaymentWebhook, getPaymentStatus } from '../controllers/payment.controller';
import { verifyWebhookSignature } from '../middlewares/webhook.middleware';
const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Payment route working!' });
});
// Initiate payment for a session
router.post('/initiate', initiatePayment);

// Webhook endpoint for payment providers
router.post('/webhook/:provider', (req, res, next) => verifyWebhookSignature(req.params.provider)(req, res, next), handlePaymentWebhook);

// Get payment status
router.get('/status/:sessionToken', getPaymentStatus);  

export default router;