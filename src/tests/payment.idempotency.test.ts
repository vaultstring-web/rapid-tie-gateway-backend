jest.mock('../server', () => ({
  prisma: {},
  emitNotification: jest.fn(),
  emitSalesUpdate: jest.fn(),
}));

jest.mock('../services/payment.service', () => ({
  paymentService: {
    initiatePayment: jest.fn().mockResolvedValue({
      transactionRef: 'TX-TEST-001',
      status: 'pending',
    }),
  },
}));

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
};

jest.mock('../services/redisClient.service', () => ({
  getRedisClient: jest.fn(() => Promise.resolve(redisMock)),
}));

import request from 'supertest';
import { createTestApp } from './helpers/testApp';
import { hashRequestBody } from '../services/idempotency.service';

describe('POST /api/payments/initiate idempotency', () => {
  const app = createTestApp();
  const body = { sessionToken: 'test-session-token', paymentMethod: 'airtel_money' };
  const idempotencyKey = `idem-test-${Date.now()}`;
  const requestHash = hashRequestBody(body);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replays the same response when Idempotency-Key is reused after completion', async () => {
    redisMock.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK');
    redisMock.get.mockResolvedValue(null);

    const first = await request(app)
      .post('/api/payments/initiate')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue(
      JSON.stringify({
        status: 'completed',
        requestHash,
        createdAt: new Date().toISOString(),
        response: { httpStatus: 200, body: first.body },
      })
    );

    const second = await request(app)
      .post('/api/payments/initiate')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
  });
});
