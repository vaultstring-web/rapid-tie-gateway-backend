"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteTeamSchema = exports.checkoutSettingsSchema = exports.webhookLogsQuerySchema = exports.updateWebhookSchema = exports.createWebhookSchema = exports.apiKeyParamsSchema = exports.createApiKeySchema = exports.refundSchema = exports.createPaymentLinkSchema = exports.paymentLinksQuerySchema = exports.transactionParamsSchema = exports.transactionsQuerySchema = exports.analyticsSchema = void 0;
const zod_1 = require("zod");
const amountInput = zod_1.z.union([
    zod_1.z.number(),
    zod_1.z.string().trim().regex(/^\d+(\.\d+)?$/, 'Amount must be a valid number'),
]);
const optionalUrl = zod_1.z.union([zod_1.z.string().url('Invalid URL'), zod_1.z.literal('')]).optional();
exports.analyticsSchema = zod_1.z.object({
    body: zod_1.z.object({
        startDate: zod_1.z.string().min(1, 'startDate is required'),
        endDate: zod_1.z.string().min(1, 'endDate is required'),
        status: zod_1.z.string().trim().optional(),
        paymentMethod: zod_1.z.string().trim().optional(),
        eventId: zod_1.z.string().trim().optional(),
        exportCsv: zod_1.z.union([zod_1.z.boolean(), zod_1.z.enum(['true', 'false'])]).optional(),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.transactionsQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
        status: zod_1.z.string().trim().optional(),
        paymentMethod: zod_1.z.string().trim().optional(),
        startDate: zod_1.z.string().trim().optional(),
        endDate: zod_1.z.string().trim().optional(),
        minAmount: amountInput.optional(),
        maxAmount: amountInput.optional(),
        eventId: zod_1.z.string().trim().optional(),
        search: zod_1.z.string().trim().optional(),
    }),
    body: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.transactionParamsSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Transaction id is required'),
    }),
    body: zod_1.z.object({}).optional(),
    query: zod_1.z.object({}).optional(),
});
exports.paymentLinksQuerySchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
        eventId: zod_1.z.string().trim().optional(),
        active: zod_1.z.enum(['true', 'false']).optional(),
    }),
    body: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.createPaymentLinkSchema = zod_1.z.object({
    body: zod_1.z.object({
        title: zod_1.z.string().trim().min(1, 'title is required'),
        description: zod_1.z.string().trim().optional(),
        amount: amountInput.optional(),
        currency: zod_1.z.string().trim().min(3).max(10).optional(),
        singleUse: zod_1.z.boolean().optional(),
        expiresAt: zod_1.z.string().trim().optional(),
        eventId: zod_1.z.string().trim().optional(),
        metadata: zod_1.z.record(zod_1.z.any()).optional(),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.refundSchema = zod_1.z.object({
    body: zod_1.z.object({
        transactionId: zod_1.z.string().min(1, 'transactionId is required'),
        amount: amountInput,
        reason: zod_1.z.string().trim().max(500).optional(),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.createApiKeySchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(1, 'Key name is required'),
        permissions: zod_1.z.array(zod_1.z.string().trim().min(1)).optional(),
        expiresAt: zod_1.z.string().trim().optional(),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.apiKeyParamsSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'API key id is required'),
    }),
    body: zod_1.z.object({}).optional(),
    query: zod_1.z.object({}).optional(),
});
exports.createWebhookSchema = zod_1.z.object({
    body: zod_1.z.object({
        url: zod_1.z.string().url('Invalid webhook URL'),
        events: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1, 'At least one event subscription is required'),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.updateWebhookSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Webhook id is required'),
    }),
    body: zod_1.z.object({
        url: zod_1.z.string().url('Invalid webhook URL').optional(),
        events: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1).optional(),
        active: zod_1.z.boolean().optional(),
    }),
    query: zod_1.z.object({}).optional(),
});
exports.webhookLogsQuerySchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Webhook id is required'),
    }),
    query: zod_1.z.object({
        page: zod_1.z.string().regex(/^\d+$/, 'page must be a positive integer').optional(),
    }),
    body: zod_1.z.object({}).optional(),
});
exports.checkoutSettingsSchema = zod_1.z.object({
    body: zod_1.z.object({
        checkoutBranding: zod_1.z.record(zod_1.z.any()).optional(),
        paymentMethods: zod_1.z.record(zod_1.z.any()).optional(),
        successUrl: optionalUrl,
        cancelUrl: optionalUrl,
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
exports.inviteTeamSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email format'),
        role: zod_1.z.enum(['admin', 'manager', 'viewer', 'support']),
        eventPermissions: zod_1.z.array(zod_1.z.string().trim().min(1)).optional(),
    }),
    query: zod_1.z.object({}).optional(),
    params: zod_1.z.object({}).optional(),
});
//# sourceMappingURL=merchant.validators.js.map