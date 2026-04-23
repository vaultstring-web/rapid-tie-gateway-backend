"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler_1 = require("../utils/errorHandler");
const prismaMock = {
    dsaRequest: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    approval: {
        upsert: jest.fn(),
    },
};
jest.mock('../server', () => ({
    prisma: prismaMock,
}));
const approver_controller_1 = require("../controllers/approver.controller");
function makeReq(overrides = {}) {
    return {
        user: {
            approver: {
                id: 'approver-1',
                organizationId: 'org-1',
                approvalLevel: 1,
            },
        },
        params: {},
        body: {},
        ...overrides,
    };
}
function makeRes() {
    const res = {
        json: jest.fn(),
        status: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
}
const MOCK_DSA_REQUEST = {
    id: 'req-1',
    requestNumber: 'DSA-2024-001',
    destination: 'Blantyre',
    purpose: 'Field audit',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-02-03'),
    duration: 2,
    perDiemRate: 15000,
    accommodationRate: 10000,
    totalAmount: 50000,
    currency: 'MWK',
    status: 'PENDING',
    organizationId: 'org-1',
    submittedAt: new Date('2024-01-28'),
    updatedAt: new Date('2024-01-28'),
    notes: null,
    employee: {
        user: { firstName: 'Alice', lastName: 'Banda', email: 'alice@example.com' },
        department: { name: 'Finance' },
    },
    approvals: [],
};
describe('ApproverController', () => {
    const controller = new approver_controller_1.ApproverController();
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('getPending', () => {
        it('returns mapped pending requests for the approver\'s org', async () => {
            prismaMock.dsaRequest.findMany.mockResolvedValue([MOCK_DSA_REQUEST]);
            const req = makeReq();
            const res = makeRes();
            const next = jest.fn();
            await controller.getPending(req, res, next);
            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledTimes(1);
            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.data).toHaveLength(1);
            const item = payload.data[0];
            expect(item.id).toBe('req-1');
            expect(item.requestNumber).toBe('DSA-2024-001');
            expect(item.employee.firstName).toBe('Alice');
            expect(item.employee.department).toBe('Finance');
        });
        it('returns an empty array when there are no pending requests', async () => {
            prismaMock.dsaRequest.findMany.mockResolvedValue([]);
            const req = makeReq();
            const res = makeRes();
            const next = jest.fn();
            await controller.getPending(req, res, next);
            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.data).toHaveLength(0);
        });
        it('calls next(AppError 403) when user has no approver profile', async () => {
            const req = makeReq({ user: {} });
            const res = makeRes();
            const next = jest.fn();
            await controller.getPending(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(403);
            expect(res.json).not.toHaveBeenCalled();
        });
        it('forwards unexpected Prisma errors to next()', async () => {
            prismaMock.dsaRequest.findMany.mockRejectedValue(new Error('DB connection lost'));
            const req = makeReq();
            const res = makeRes();
            const next = jest.fn();
            await controller.getPending(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
        });
        it('queries with the correct organizationId and PENDING status filter', async () => {
            prismaMock.dsaRequest.findMany.mockResolvedValue([]);
            const req = makeReq();
            const res = makeRes();
            await controller.getPending(req, res, jest.fn());
            expect(prismaMock.dsaRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { organizationId: 'org-1', status: 'PENDING' },
            }));
        });
    });
    describe('getDetail', () => {
        it('returns the full request detail for a valid id', async () => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue(MOCK_DSA_REQUEST);
            const req = makeReq({ params: { id: 'req-1' } });
            const res = makeRes();
            const next = jest.fn();
            await controller.getDetail(req, res, next);
            expect(next).not.toHaveBeenCalled();
            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.data.id).toBe('req-1');
        });
        it('calls next(AppError 404) when request is not found', async () => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue(null);
            const req = makeReq({ params: { id: 'nonexistent' } });
            const res = makeRes();
            const next = jest.fn();
            await controller.getDetail(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(404);
        });
        it('calls next(AppError 403) when user has no approver profile', async () => {
            const req = makeReq({ user: {}, params: { id: 'req-1' } });
            const res = makeRes();
            const next = jest.fn();
            await controller.getDetail(req, res, next);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(403);
        });
        it('scopes the query to the approver\'s organizationId', async () => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue(MOCK_DSA_REQUEST);
            const req = makeReq({ params: { id: 'req-1' } });
            const res = makeRes();
            await controller.getDetail(req, res, jest.fn());
            expect(prismaMock.dsaRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'req-1', organizationId: 'org-1' },
            }));
        });
    });
    describe('processAction("approve")', () => {
        const handler = new approver_controller_1.ApproverController().processAction('approve');
        beforeEach(() => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue({ ...MOCK_DSA_REQUEST });
            prismaMock.approval.upsert.mockResolvedValue({});
            prismaMock.dsaRequest.update.mockResolvedValue({});
        });
        it('upserts an approval record and updates request status to APPROVED', async () => {
            const req = makeReq({ params: { id: 'req-1' }, body: { comments: 'Looks good' } });
            const res = makeRes();
            const next = jest.fn();
            await handler(req, res, next);
            expect(next).not.toHaveBeenCalled();
            expect(prismaMock.approval.upsert).toHaveBeenCalledWith(expect.objectContaining({
                create: expect.objectContaining({
                    status: 'approved',
                    comments: 'Looks good',
                    approverId: 'approver-1',
                }),
                update: expect.objectContaining({ status: 'approved' }),
            }));
            expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'req-1' },
                data: expect.objectContaining({ status: 'APPROVED' }),
            }));
            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.data.status).toBe('APPROVED');
        });
        it('works with no comments supplied', async () => {
            const req = makeReq({ params: { id: 'req-1' }, body: {} });
            const res = makeRes();
            await handler(req, res, jest.fn());
            expect(prismaMock.approval.upsert).toHaveBeenCalledWith(expect.objectContaining({
                create: expect.objectContaining({ comments: null }),
            }));
        });
        it('calls next(AppError 400) when request is not PENDING', async () => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue({
                ...MOCK_DSA_REQUEST,
                status: 'APPROVED',
            });
            const req = makeReq({ params: { id: 'req-1' }, body: {} });
            const res = makeRes();
            const next = jest.fn();
            await handler(req, res, next);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(400);
            expect(prismaMock.approval.upsert).not.toHaveBeenCalled();
        });
        it('calls next(AppError 404) when request is not found', async () => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue(null);
            const req = makeReq({ params: { id: 'ghost' }, body: {} });
            const res = makeRes();
            const next = jest.fn();
            await handler(req, res, next);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(404);
        });
        it('calls next(AppError 403) when user has no approver profile', async () => {
            const req = makeReq({ user: {}, params: { id: 'req-1' }, body: {} });
            const res = makeRes();
            const next = jest.fn();
            await handler(req, res, next);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(errorHandler_1.AppError);
            expect(err.statusCode).toBe(403);
        });
    });
    describe('processAction("reject")', () => {
        const handler = new approver_controller_1.ApproverController().processAction('reject');
        beforeEach(() => {
            prismaMock.dsaRequest.findFirst.mockResolvedValue({ ...MOCK_DSA_REQUEST });
            prismaMock.approval.upsert.mockResolvedValue({});
            prismaMock.dsaRequest.update.mockResolvedValue({});
        });
        it('sets approval status to "rejected" and request status to REJECTED', async () => {
            const req = makeReq({ params: { id: 'req-1' }, body: { comments: 'Missing docs' } });
            const res = makeRes();
            const next = jest.fn();
            await handler(req, res, next);
            expect(next).not.toHaveBeenCalled();
            expect(prismaMock.approval.upsert).toHaveBeenCalledWith(expect.objectContaining({
                create: expect.objectContaining({ status: 'rejected' }),
                update: expect.objectContaining({ status: 'rejected' }),
            }));
            expect(prismaMock.dsaRequest.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'REJECTED' }),
            }));
            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.data.status).toBe('REJECTED');
        });
    });
});
//# sourceMappingURL=approver.controller.js.map