import { Router } from 'express';
import { initiatePayment, handlePaymentWebhook, getPaymentStatus } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { 
  initiatePaymentSchema, 
  getPaymentStatusSchema 
} from '../validators/payment.validators';

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Payment route working!' });
});

// ✅ Add validation to initiate payment
router.post(
  '/initiate', 
  authenticate, 
  validate(initiatePaymentSchema), 
  initiatePayment
);

// Webhook endpoint for payment providers (validation handled in controller)
router.post('/webhook/:provider', handlePaymentWebhook);

// ✅ Add validation to get payment status
router.get(
  '/status/:sessionToken', 
  authenticate, 
  validate(getPaymentStatusSchema), 
  getPaymentStatus
);

export default router;