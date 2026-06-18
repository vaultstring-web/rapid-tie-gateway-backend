import { Router } from 'express';
import { initiatePayment, handlePaymentWebhook, getPaymentStatus } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Payment route working!' });
});

// authentication to initiate payment
router.post('/initiate', authenticate, initiatePayment);

// Webhook endpoint for payment providers 
router.post('/webhook/:provider', handlePaymentWebhook);

// authentication to get payment status
router.get('/status/:sessionToken', authenticate, getPaymentStatus);

export default router;