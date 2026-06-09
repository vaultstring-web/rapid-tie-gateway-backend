import { NextFunction, Response } from 'express';

const txMock = {
  disbursementItem: {
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  dsaRequest: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  budget: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
  disbursementBatch: {
    update: jest.fn(),
  },
};

// eslint-disable-next-line no-var
var prismaMock: {
  financeOfficer: { findUnique: jest.Mock };
  disbursementBatch: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

prismaMock = {
  financeOfficer: { findUnique: jest.fn() },
  disbursementBatch: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
};

jest.mock('../server', () => ({
  prisma: prismaMock,
  emitNotification: jest.fn(),
}));

import { emitNotification } from '../server';
import financeController from '../controllers/finance.controller';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-fin', financeOfficer: { id: 'fin-1', organizationId: 'org-1' } },
    params: { id: 'batch-1' },
    body: { status: 'processing' },
    ...overrides,
  } as any;
}

function makeRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
}

describe('FinanceController.processBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.financeOfficer.findUnique.mockResolvedValue({
      id: 'fin-1',
      userId: 'user-fin',
      organizationId: 'org-1',
    });
    prismaMock.disbursementBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'processing',
      organizationId: 'org-1',
      items: [],
    });

    txMock.disbursementItem.updateMany.mockResolvedValue({ count: 1 });
    txMock.disbursementItem.findMany
      .mockResolvedValueOnce([{ requestId: 'req-1', amount: 10000 }])
      .mockResolvedValueOnce([
        {
          requestId: 'req-1',
          request: {
            id: 'req-1',
            requestNumber: 'DSA-001',
            destination: 'Blantyre',
            totalAmount: 10000,
            employee: { user: { id: 'emp-user-1' } },
          },
        },
      ]);
    txMock.dsaRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      employee: { departmentId: 'dept-1', user: { id: 'emp-user-1' } },
    });
    txMock.budget.findFirst.mockResolvedValue({
      id: 'budget-1',
      allocated: 200000,
      spent: 0,
      committed: 10000,
    });
    txMock.dsaRequest.updateMany.mockResolvedValue({ count: 1 });
    txMock.notification.create.mockResolvedValue({ id: 'n-1' });
    txMock.disbursementBatch.update.mockResolvedValue({ id: 'batch-1', status: 'completed' });
    prismaMock.disbursementBatch.update.mockResolvedValue({ id: 'batch-1', status: 'processing' });
    prismaMock.disbursementBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'processing',
    });
  });

  it('does not auto-complete to PAID (requires manual confirmation upload)', async () => {
    const res = makeRes();
    await financeController.processBatch(makeReq(), res, jest.fn() as NextFunction);

    expect(prismaMock.disbursementBatch.findFirst).toHaveBeenCalled();
    expect(txMock.disbursementItem.updateMany).not.toHaveBeenCalled();
    expect(txMock.budget.update).not.toHaveBeenCalled();
    expect(txMock.dsaRequest.updateMany).not.toHaveBeenCalled();
    expect(txMock.notification.create).not.toHaveBeenCalled();
    expect(emitNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
