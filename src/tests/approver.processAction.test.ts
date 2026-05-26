import { NextFunction, Response } from 'express';

// eslint-disable-next-line no-var
var prismaMock: {
  dsaRequest: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  approval: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  budget: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  notification: {
    create: jest.Mock;
  };
};

prismaMock = {
  dsaRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  approval: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  budget: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
};

jest.mock('../server', () => ({
  prisma: prismaMock,
  emitNotification: jest.fn(),
}));

import { emitNotification } from '../server';
import { ApproverController } from '../controllers/approver.controller';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-approver',
      approver: { id: 'appr-1', organizationId: 'org-1', approvalLevel: 1 },
    },
    params: { id: 'req-1' },
    body: { comments: 'Approved for travel' },
    ...overrides,
  } as any;
}

function makeRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('ApproverController.processAction', () => {
  const controller = new ApproverController();
  const approve = controller.processAction('approve');
  const reject = controller.processAction('reject');

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.dsaRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      requestNumber: 'DSA-001',
      destination: 'Lilongwe',
      status: 'PENDING',
      totalAmount: 50000,
      employee: { departmentId: 'dept-1' },
    });
    prismaMock.approval.findFirst.mockResolvedValue(null);
    prismaMock.budget.findFirst.mockResolvedValue({
      id: 'budget-1',
      allocated: 500000,
      spent: 0,
      committed: 0,
    });
    prismaMock.approval.create.mockResolvedValue({ id: 'approval-1' });
    prismaMock.dsaRequest.update.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });
    prismaMock.dsaRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      employee: { user: { id: 'emp-user-1' } },
    });
    prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' });
  });

  it('approves a pending request and notifies the employee', async () => {
    const res = makeRes();
    await approve(makeReq(), res, jest.fn() as NextFunction);

    expect(prismaMock.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved', requestId: 'req-1' }),
      })
    );
    expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
    expect(prismaMock.notification.create).toHaveBeenCalled();
    expect(emitNotification).toHaveBeenCalledWith('emp-user-1', expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });

  it('rejects a pending request without budget update', async () => {
    const res = makeRes();
    await reject(makeReq(), res, jest.fn() as NextFunction);

    expect(prismaMock.budget.update).not.toHaveBeenCalled();
    expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
    );
    expect(prismaMock.notification.create).toHaveBeenCalled();
  });
});
