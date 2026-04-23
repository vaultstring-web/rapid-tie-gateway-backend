import { NextFunction, Response } from 'express';

const prismaMock = {
  employee: {
    findUnique: jest.fn(),
  },
  dsaRequest: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  event: {
    findMany: jest.fn(),
  },
};

jest.mock('../server', () => ({
  prisma: prismaMock,
}));

import { EmployeeController } from '../controllers/employee.controller';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1' },
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

describe('EmployeeController', () => {
  const controller = new EmployeeController();

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      userId: 'user-1',
      organizationId: 'org-1',
      employeeId: 'EMP001',
      jobTitle: 'Analyst',
      grade: 'G1',
      departmentId: 'dept-1',
      department: { id: 'dept-1', name: 'Finance', code: 'FIN' },
      organization: { id: 'org-1', name: 'Org One' },
    });
  });

  it('returns request list with event associations and approval timeline', async () => {
    prismaMock.dsaRequest.findMany.mockResolvedValue([
      {
        id: 'req-1',
        destination: 'Lilongwe',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-12'),
        approvals: [
          {
            level: 1,
            status: 'approved',
            comments: 'ok',
            approvedAt: new Date('2026-01-05'),
            approver: { user: { firstName: 'Amy', lastName: 'Zulu' } },
          },
        ],
        disbursementItem: null,
      },
    ]);
    prismaMock.dsaRequest.count.mockResolvedValue(1);
    prismaMock.event.findMany.mockResolvedValue([
      { id: 'evt-1', name: 'City Expo', city: 'Lilongwe' },
    ]);

    const res = makeRes();
    await controller.getMyRequests(makeReq(), res, jest.fn() as NextFunction);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.requests[0].events).toHaveLength(1);
    expect(payload.data.requests[0].approvalTimeline[0].approverName).toBe('Amy Zulu');
    expect(payload.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 10,
        total: 1,
      })
    );
  });
});
