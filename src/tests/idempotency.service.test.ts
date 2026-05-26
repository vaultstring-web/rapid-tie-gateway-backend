import {
  beginIdempotency,
  completeIdempotency,
  hashRequestBody,
} from '../services/idempotency.service';

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
};

jest.mock('../services/redisClient.service', () => ({
  getRedisClient: jest.fn(() => Promise.resolve(redisMock)),
}));

describe('idempotency.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hashRequestBody is stable for the same payload', () => {
    const a = hashRequestBody({ sessionToken: 'abc', paymentMethod: 'airtel' });
    const b = hashRequestBody({ sessionToken: 'abc', paymentMethod: 'airtel' });
    expect(a).toBe(b);
  });

  it('beginIdempotency acquires a new key with NX+EX', async () => {
    redisMock.set.mockResolvedValue('OK');

    const result = await beginIdempotency({
      namespace: 'payments:initiate',
      idempotencyKey: 'key-1',
      requestHash: 'hash-1',
      ttlSeconds: 300,
    });

    expect(result.type).toBe('acquired');
    expect(redisMock.set).toHaveBeenCalledWith(
      'idem:payments:initiate:key-1',
      expect.any(String),
      'EX',
      300,
      'NX'
    );
  });

  it('beginIdempotency replays a completed record', async () => {
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue(
      JSON.stringify({
        status: 'completed',
        requestHash: 'hash-1',
        createdAt: new Date().toISOString(),
        response: { httpStatus: 200, body: { success: true, data: { id: 'pay-1' } } },
      })
    );

    const result = await beginIdempotency({
      namespace: 'payments:initiate',
      idempotencyKey: 'key-1',
      requestHash: 'hash-1',
    });

    expect(result.type).toBe('replay');
    if (result.type === 'replay') {
      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual({ success: true, data: { id: 'pay-1' } });
    }
  });

  it('completeIdempotency stores response with EX ttl', async () => {
    redisMock.set.mockResolvedValue('OK');

    await completeIdempotency({
      key: 'idem:payments:initiate:key-1',
      requestHash: 'hash-1',
      httpStatus: 200,
      body: { success: true },
      ttlSeconds: 600,
    });

    expect(redisMock.set).toHaveBeenCalledWith(
      'idem:payments:initiate:key-1',
      expect.stringContaining('"status":"completed"'),
      'EX',
      600
    );
  });
});
