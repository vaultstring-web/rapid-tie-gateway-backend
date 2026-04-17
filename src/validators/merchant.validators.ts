import { z } from 'zod';

const amountInput = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(\.\d+)?$/, 'Amount must be a valid number'),
]);

const optionalUrl = z.union([z.string().url('Invalid URL'), z.literal('')]).optional();

export const analyticsSchema = z.object({
  body: z.object({
    startDate: z.string().min(1, 'startDate is required'),
    endDate: z.string().min(1, 'endDate is required'),
    status: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    eventId: z.string().trim().optional(),
    exportCsv: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const transactionsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
    status: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    minAmount: amountInput.optional(),
    maxAmount: amountInput.optional(),
    eventId: z.string().trim().optional(),
    search: z.string().trim().optional(),
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const transactionParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Transaction id is required'),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const paymentLinksQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
    eventId: z.string().trim().optional(),
    active: z.enum(['true', 'false']).optional(),
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const createPaymentLinkSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'title is required'),
    description: z.string().trim().optional(),
    amount: amountInput.optional(),
    currency: z.string().trim().min(3).max(10).optional(),
    singleUse: z.boolean().optional(),
    expiresAt: z.string().trim().optional(),
    eventId: z.string().trim().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const refundSchema = z.object({
  body: z.object({
    transactionId: z.string().min(1, 'transactionId is required'),
    amount: amountInput,
    reason: z.string().trim().max(500).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Key name is required'),
    permissions: z.array(z.string().trim().min(1)).optional(),
    expiresAt: z.string().trim().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const apiKeyParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'API key id is required'),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const createWebhookSchema = z.object({
  body: z.object({
    url: z.string().url('Invalid webhook URL'),
    events: z.array(z.string().trim().min(1)).min(1, 'At least one event subscription is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const updateWebhookSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Webhook id is required'),
  }),
  body: z.object({
    url: z.string().url('Invalid webhook URL').optional(),
    events: z.array(z.string().trim().min(1)).min(1).optional(),
    active: z.boolean().optional(),
  }),
  query: z.object({}).optional(),
});

export const webhookLogsQuerySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Webhook id is required'),
  }),
  query: z.object({
    page: z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
  }),
  body: z.object({}).optional(),
});

export const checkoutSettingsSchema = z.object({
  body: z.object({
    checkoutBranding: z.record(z.any()).optional(),
    paymentMethods: z.record(z.any()).optional(),
    successUrl: optionalUrl,
    cancelUrl: optionalUrl,
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const inviteTeamSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    role: z.enum(['admin', 'manager', 'viewer', 'support']),
    eventPermissions: z.array(z.string().trim().min(1)).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});