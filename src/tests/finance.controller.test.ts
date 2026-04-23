import { NextFunction, Response } from 'express';

const prismaMock = {
  financeOfficer: {
    findUnique: jest.fn(),
  },
  dsaRequest: {
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  event: {
    findMany: jest.fn(),
  },
  disbursementBatch: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../server', () => ({
  prisma: prismaMock,
}));

import { FinanceController } from '../controllers/finance.controller';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-fin' },
    query: { page: '1', limit: '10' },
    ...overrides,
  } as any;
}

function makeRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('FinanceController', () => {
  const controller = new FinanceController();

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.financeOfficer.findUnique.mockResolvedValue({
      id: 'fin-1',
      userId: 'user-fin',
      organizationId: 'org-1',
      role: 'OFFICER',
      organization: { id: 'org-1', name: 'Org' },
    });
  });

  it('returns ready disbursements with event and recipient validation details', async () => {
    prismaMock.dsaRequest.findMany.mockResolvedValue([
      {
        id: 'req-1',
        destination: 'Mzuzu',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-02-04'),
        totalAmount: 120000,
        employee: {
          mobileMoney: { phoneNumber: '+265991111111' },
          bankAccount: null,
        },
      },
    ]);
    prismaMock.dsaRequest.count.mockResolvedValue(1);
    prismaMock.dsaRequest.aggregate.mockResolvedValue({ _sum: { totalAmount: 120000 } });
    prismaMock.event.findMany.mockResolvedValue([{ id: 'evt-2', name: 'North Summit' }]);

    const res = makeRes();
    await controller.getDisbursements(makeReq(), res, jest.fn() as NextFunction);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.requests[0].hasEvents).toBe(true);
    expect(payload.data.requests[0].recipientValidation.valid).toBe(true);
    expect(payload.meta.total).toBe(1);
  });

  it('returns batches with computed success/failure/progress fields', async () => {
    prismaMock.disbursementBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        itemCount: 4,
        metadata: null,
        items: [{ status: 'success' }, { status: 'success' }, { status: 'failed' }, { status: 'pending' }],
      },
    ]);
    prismaMock.disbursementBatch.count.mockResolvedValue(1);

    const res = makeRes();
    await controller.getBatches(makeReq(), res, jest.fn() as NextFunction);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    const batch = payload.data.batches[0];
    expect(batch.successCount).toBe(2);
    expect(batch.failedCount).toBe(1);
    expect(batch.progressPercentage).toBe(75);
  });
});
