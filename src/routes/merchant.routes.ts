// src/routes/merchant.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import merchantController from '../controllers/merchant.controller';
import {
  analyticsSchema,
  apiKeyParamsSchema,
  refundSchema,
  createApiKeySchema,
  createWebhookSchema,
  updateWebhookSchema,
  checkoutSettingsSchema,
  inviteTeamSchema,
  createPaymentLinkSchema,
  paymentLinksQuerySchema,
  transactionParamsSchema,
  transactionsQuerySchema,
  webhookLogsQuerySchema,
} from '../validators/merchant.validators';

const router: Router = Router();

// All merchant routes require authentication and MERCHANT role
router.use(authenticate);
router.use(authorize('MERCHANT'));

// ─── Dashboard ──────────────────────────────────────────────────────────────
// GET /api/merchant/dashboard
router.get('/dashboard', merchantController.getDashboard.bind(merchantController));

// ─── Analytics ──────────────────────────────────────────────────────────────
// POST /api/merchant/analytics
router.post('/analytics', validate(analyticsSchema), merchantController.getAnalytics.bind(merchantController));

// ─── Transactions ────────────────────────────────────────────────────────────
// GET /api/merchant/transactions          (paginated, filterable)
router.get('/transactions', validate(transactionsQuerySchema), merchantController.getTransactions.bind(merchantController));

// GET /api/merchant/transactions/:id      (full detail + audit + refund eligibility)
router.get('/transactions/:id', validate(transactionParamsSchema), merchantController.getTransactionById.bind(merchantController));

// ─── Payment Links ────────────────────────────────────────────────────────────
// GET  /api/merchant/payment-links
router.get('/payment-links', validate(paymentLinksQuerySchema), merchantController.getPaymentLinks.bind(merchantController));

// POST /api/merchant/payment-links
router.post('/payment-links', validate(createPaymentLinkSchema), merchantController.createPaymentLink.bind(merchantController));

// ─── Refunds ──────────────────────────────────────────────────────────────────
// POST /api/merchant/refunds
router.post('/refunds', validate(refundSchema), merchantController.processRefund.bind(merchantController));

// ─── API Keys ──────────────────────────────────────────────────────────────────
// GET    /api/merchant/api-keys
router.get('/api-keys', merchantController.listApiKeys.bind(merchantController));

// POST   /api/merchant/api-keys
router.post('/api-keys', validate(createApiKeySchema), merchantController.createApiKey.bind(merchantController));

// DELETE /api/merchant/api-keys/:id
router.delete('/api-keys/:id', validate(apiKeyParamsSchema), merchantController.revokeApiKey.bind(merchantController));

// ─── Webhooks ──────────────────────────────────────────────────────────────────
// GET    /api/merchant/webhooks
router.get('/webhooks', merchantController.listWebhooks.bind(merchantController));

// POST   /api/merchant/webhooks
router.post('/webhooks', validate(createWebhookSchema), merchantController.createWebhook.bind(merchantController));

// PUT    /api/merchant/webhooks/:id
router.put('/webhooks/:id', validate(updateWebhookSchema), merchantController.updateWebhook.bind(merchantController));

// DELETE /api/merchant/webhooks/:id
router.delete('/webhooks/:id', validate(updateWebhookSchema), merchantController.deleteWebhook.bind(merchantController));

// GET    /api/merchant/webhooks/:id/logs
router.get('/webhooks/:id/logs', validate(webhookLogsQuerySchema), merchantController.getWebhookLogs.bind(merchantController));

// ─── Checkout Settings ────────────────────────────────────────────────────────
// GET /api/merchant/settings/checkout
router.get('/settings/checkout', merchantController.getCheckoutSettings.bind(merchantController));

// PUT /api/merchant/settings/checkout
router.put('/settings/checkout', validate(checkoutSettingsSchema), merchantController.updateCheckoutSettings.bind(merchantController));

// ─── Team Members ─────────────────────────────────────────────────────────────
// GET  /api/merchant/team
router.get('/team', merchantController.getTeamMembers.bind(merchantController));

// POST /api/merchant/team/invite
router.post('/team/invite', validate(inviteTeamSchema), merchantController.inviteTeamMember.bind(merchantController));

export default router;