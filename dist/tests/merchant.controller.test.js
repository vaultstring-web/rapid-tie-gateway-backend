"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler_1 = require("../utils/errorHandler");
const prismaMock = {
    merchant: { findUnique: jest.fn() },
    paymentLink: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    activityLog: { findMany: jest.fn(), create: jest.fn() },
    notification: { create: jest.fn() },
};
jest.mock('../server', () => ({
    prisma: prismaMock,
}));
jest.mock('../utils/cache', () => ({
    cache: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
const merchant_controller_1 = require("../controllers/merchant.controller");
describe('MerchantController', () => {
    const controller = new merchant_controller_1.MerchantController();
    beforeEach(() => {
        jest.clearAllMocks();
        prismaMock.merchant.findUnique.mockResolvedValue({
            id: 'merchant-1',
            userId: 'user-1',
            businessType: 'retail',
            city: 'Lilongwe',
        });
    });
    it('returns payment links with conversion rates and aggregate summary', async () => {
        prismaMock.paymentLink.findMany.mockResolvedValue([
            {
                id: 'pl-1',
                merchantId: 'merchant-1',
                title: 'Link 1',
                views: 100,
                conversions: 25,
                active: true,
                createdAt: new Date(),
                event: null,
            },
            {
                id: 'pl-2',
                merchantId: 'merchant-1',
                title: 'Link 2',
                views: 0,
                conversions: 0,
                active: false,
                createdAt: new Date(),
                event: null,
            },
        ]);
        prismaMock.paymentLink.count.mockResolvedValue(2);
        prismaMock.paymentLink.aggregate.mockResolvedValue({
            _count: { id: 12 },
            _sum: { views: 500, conversions: 90 },
        });
        const req = {
            user: { id: 'user-1', role: 'MERCHANT' },
            query: { page: '1' },
        };
        const json = jest.fn();
        const res = { json };
        const next = jest.fn();
        await controller.getPaymentLinks(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(json).toHaveBeenCalledTimes(1);
        const payload = json.mock.calls[0][0];
        expect(payload.data.paymentLinks[0].conversionRate).toBe(25);
        expect(payload.data.paymentLinks[1].conversionRate).toBe(0);
        expect(payload.data.summary).toEqual({
            totalLinks: 12,
            activeLinks: 1,
            totalViews: 500,
            totalConversions: 90,
        });
    });
    it('blocks duplicate pending team invitation for same email', async () => {
        prismaMock.activityLog.findMany.mockResolvedValue([
            {
                id: 'invite-1',
                newValue: {
                    email: 'staff@example.com',
                    status: 'pending',
                },
            },
        ]);
        const req = {
            user: { id: 'user-1', role: 'MERCHANT' },
            body: { email: 'staff@example.com', role: 'manager' },
        };
        const res = { status: jest.fn(), json: jest.fn() };
        const next = jest.fn();
        await controller.inviteTeamMember(req, res, next);
        expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
        expect(prismaMock.notification.create).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        const passedError = next.mock.calls[0][0];
        expect(passedError).toBeInstanceOf(errorHandler_1.AppError);
        expect(passedError.statusCode).toBe(409);
        expect(passedError.message).toContain('pending invitation');
    });
});
//# sourceMappingURL=merchant.controller.test.js.map