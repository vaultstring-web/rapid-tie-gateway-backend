"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merchant_validators_1 = require("../validators/merchant.validators");
describe('merchant validators', () => {
    it('accepts a valid analytics payload', async () => {
        await expect(merchant_validators_1.analyticsSchema.parseAsync({
            body: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                status: 'success',
                paymentMethod: 'card',
                exportCsv: true,
            },
            query: {},
            params: {},
        })).resolves.toBeDefined();
    });
    it('rejects non-numeric transaction page query', async () => {
        await expect(merchant_validators_1.transactionsQuerySchema.parseAsync({
            body: {},
            params: {},
            query: {
                page: 'abc',
            },
        })).rejects.toThrow('page must be a positive integer');
    });
    it('rejects payment link creation with invalid amount', async () => {
        await expect(merchant_validators_1.createPaymentLinkSchema.parseAsync({
            body: {
                title: 'Event tickets',
                amount: 'ten',
            },
            query: {},
            params: {},
        })).rejects.toThrow('Amount must be a valid number');
    });
    it('requires webhook id in update params', async () => {
        await expect(merchant_validators_1.updateWebhookSchema.parseAsync({
            body: {
                active: true,
            },
            query: {},
            params: {
                id: '',
            },
        })).rejects.toThrow('Webhook id is required');
    });
});
//# sourceMappingURL=merchant.validators.test.js.map