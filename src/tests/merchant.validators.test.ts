import {
  analyticsSchema,
  createPaymentLinkSchema,
  transactionsQuerySchema,
  updateWebhookSchema,
} from '../validators/merchant.validators';

describe('merchant validators', () => {
  it('accepts a valid analytics payload', async () => {
    await expect(
      analyticsSchema.parseAsync({
        body: {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          status: 'success',
          paymentMethod: 'card',
          exportCsv: true,
        },
        query: {},
        params: {},
      }),
    ).resolves.toBeDefined();
  });

  it('rejects non-numeric transaction page query', async () => {
    await expect(
      transactionsQuerySchema.parseAsync({
        body: {},
        params: {},
        query: {
          page: 'abc',
        },
      }),
    ).rejects.toThrow('page must be a positive integer');
  });

  it('rejects payment link creation with invalid amount', async () => {
    await expect(
      createPaymentLinkSchema.parseAsync({
        body: {
          title: 'Event tickets',
          amount: 'ten',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow('Amount must be a valid number');
  });

  it('requires webhook id in update params', async () => {
    await expect(
      updateWebhookSchema.parseAsync({
        body: {
          active: true,
        },
        query: {},
        params: {
          id: '',
        },
      }),
    ).rejects.toThrow('Webhook id is required');
  });
});
