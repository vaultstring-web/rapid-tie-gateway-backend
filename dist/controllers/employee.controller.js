"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeController = void 0;
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
async function getEmployee(req, next) {
    if (!req.user) {
        next(new errorHandler_1.AppError('Unauthorized', 401));
        return null;
    }
    const employee = await server_1.prisma.employee.findUnique({
        where: { userId: req.user.id },
        include: {
            organization: true,
            department: { select: { id: true, name: true, code: true } },
        },
    });
    if (!employee) {
        next(new errorHandler_1.AppError('Employee profile not found', 404));
        return null;
    }
    return employee;
}
function generateRequestNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `DSA-${ts}-${rand}`;
}
async function findEventsForTravel(destination, startDate, endDate) {
    return server_1.prisma.event.findMany({
        where: {
            city: { equals: destination, mode: 'insensitive' },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
        },
        select: {
            id: true,
            name: true,
            city: true,
            country: true,
            startDate: true,
            endDate: true,
            status: true,
            category: true,
        },
        orderBy: { startDate: 'asc' },
        take: 10,
    });
}
class EmployeeController {
    async getDashboard(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const [pendingRequests, approvedRequests, paidRequests, pendingAmountAgg, recentRequests, recentPayments, latestDepartmentBudget,] = await Promise.all([
                server_1.prisma.dsaRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
                server_1.prisma.dsaRequest.count({ where: { employeeId: employee.id, status: 'APPROVED' } }),
                server_1.prisma.dsaRequest.findMany({
                    where: { employeeId: employee.id, status: 'PAID' },
                    select: { totalAmount: true },
                }),
                server_1.prisma.dsaRequest.aggregate({
                    where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] } },
                    _sum: { totalAmount: true },
                }),
                server_1.prisma.dsaRequest.findMany({
                    where: { employeeId: employee.id },
                    orderBy: { submittedAt: 'desc' },
                    take: 5,
                    include: {
                        approvals: { select: { status: true, level: true, comments: true } },
                    },
                }),
                server_1.prisma.disbursementItem.findMany({
                    where: { request: { employeeId: employee.id } },
                    include: {
                        request: { select: { id: true, requestNumber: true, destination: true, totalAmount: true, currency: true } },
                        batch: { select: { id: true, batchNumber: true, processedAt: true } },
                    },
                    orderBy: { processedAt: 'desc' },
                    take: 5,
                }),
                server_1.prisma.budget.findFirst({
                    where: {
                        organizationId: employee.organizationId,
                        departmentId: employee.departmentId ?? undefined,
                    },
                    orderBy: [{ fiscalYear: 'desc' }, { updatedAt: 'desc' }],
                }),
            ]);
            const totalDsaPaid = paidRequests.reduce((sum, r) => sum + r.totalAmount, 0);
            const pendingCommitted = pendingAmountAgg._sum.totalAmount ?? 0;
            const allocated = latestDepartmentBudget?.allocated ?? 0;
            const spent = latestDepartmentBudget?.spent ?? 0;
            const committed = latestDepartmentBudget?.committed ?? 0;
            const remainingBalance = Math.max(0, allocated - spent - committed - pendingCommitted);
            const destinationSet = Array.from(new Set(recentRequests
                .map((item) => item.destination?.trim())
                .filter((v) => Boolean(v))));
            const destinationEvents = (await Promise.all(destinationSet.map((destination) => server_1.prisma.event.findMany({
                where: { city: { equals: destination, mode: 'insensitive' }, startDate: { gte: new Date() } },
                select: {
                    id: true,
                    name: true,
                    city: true,
                    country: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                },
                orderBy: { startDate: 'asc' },
                take: 3,
            })))).flat();
            res.json({
                success: true,
                data: {
                    stats: {
                        pending: pendingRequests,
                        approved: approvedRequests,
                        totalDsaPaid,
                        paid: paidRequests.length,
                    },
                    recentRequests,
                    recentPayments: recentPayments.map((item) => ({
                        id: item.id,
                        status: item.status,
                        amount: item.amount,
                        paymentMethod: item.paymentMethod,
                        processedAt: item.processedAt,
                        request: item.request,
                        batch: item.batch,
                    })),
                    destinationEvents,
                    remainingBalance: {
                        allocated,
                        spent,
                        committed,
                        pendingCommitted,
                        available: remainingBalance,
                    },
                    employee: {
                        id: employee.id,
                        employeeId: employee.employeeId,
                        jobTitle: employee.jobTitle,
                        grade: employee.grade,
                        department: employee.department,
                        organization: {
                            id: employee.organization.id,
                            name: employee.organization.name,
                        },
                    },
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getMyRequests(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const { page = '1', limit = '20', status, search } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10));
            const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
            const skip = (pageNum - 1) * take;
            const where = { employeeId: employee.id };
            if (status && status !== 'all')
                where.status = status.toUpperCase();
            if (search) {
                where.OR = [
                    { destination: { contains: search, mode: 'insensitive' } },
                    { purpose: { contains: search, mode: 'insensitive' } },
                    { requestNumber: { contains: search, mode: 'insensitive' } },
                ];
            }
            const [requests, total] = await Promise.all([
                server_1.prisma.dsaRequest.findMany({
                    where,
                    orderBy: { submittedAt: 'desc' },
                    skip,
                    take,
                    include: {
                        approvals: {
                            select: {
                                status: true,
                                level: true,
                                comments: true,
                                approvedAt: true,
                                approver: { include: { user: { select: { firstName: true, lastName: true } } } },
                            },
                        },
                        disbursementItem: { select: { status: true, paymentMethod: true, processedAt: true } },
                    },
                }),
                server_1.prisma.dsaRequest.count({ where }),
            ]);
            const requestsWithEvents = await Promise.all(requests.map(async (request) => {
                const events = await findEventsForTravel(request.destination, request.startDate, request.endDate);
                return {
                    ...request,
                    events,
                    approvalTimeline: request.approvals.map((approval) => ({
                        level: approval.level,
                        status: approval.status,
                        comments: approval.comments,
                        approvedAt: approval.approvedAt,
                        approverName: approval.approver?.user
                            ? `${approval.approver.user.firstName ?? ''} ${approval.approver.user.lastName ?? ''}`.trim() || null
                            : null,
                    })),
                };
            }));
            res.json({
                success: true,
                data: {
                    requests: requestsWithEvents,
                },
                meta: {
                    page: pageNum,
                    limit: take,
                    total,
                    totalPages: Math.ceil(total / take),
                    hasNext: pageNum * take < total,
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getRequest(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const { id } = req.params;
            const request = await server_1.prisma.dsaRequest.findFirst({
                where: { id, employeeId: employee.id },
                include: {
                    approvals: {
                        include: {
                            approver: {
                                include: { user: { select: { firstName: true, lastName: true, email: true } } },
                            },
                        },
                        orderBy: { level: 'asc' },
                    },
                    disbursementItem: {
                        include: { batch: { select: { batchNumber: true, status: true, processedAt: true } } },
                    },
                },
            });
            if (!request)
                return next(new errorHandler_1.AppError('Request not found', 404));
            const events = await findEventsForTravel(request.destination, request.startDate, request.endDate);
            const approvalChain = request.approvals.map((approval) => ({
                id: approval.id,
                level: approval.level,
                status: approval.status,
                comments: approval.comments,
                approvedAt: approval.approvedAt,
                approver: {
                    id: approval.approver.id,
                    email: approval.approver.user.email,
                    firstName: approval.approver.user.firstName,
                    lastName: approval.approver.user.lastName,
                },
            }));
            res.json({ success: true, data: { request, events, approvalChain } });
        }
        catch (err) {
            next(err);
        }
    }
    async createRequest(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const { destination, purpose, startDate, endDate, notes, travelAuthRef } = req.body;
            if (!destination || !purpose || !startDate || !endDate) {
                return next(new errorHandler_1.AppError('destination, purpose, startDate and endDate are required', 400));
            }
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return next(new errorHandler_1.AppError('Invalid date format', 400));
            }
            if (start > end) {
                return next(new errorHandler_1.AppError('startDate cannot be after endDate', 400));
            }
            const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const dsaRate = await server_1.prisma.dsaRate.findFirst({
                where: {
                    organizationId: employee.organizationId,
                    location: { equals: destination, mode: 'insensitive' },
                    effectiveFrom: { lte: start },
                    OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: start } },
                    ],
                    ...(employee.grade ? { OR: [{ grade: employee.grade }, { grade: null }] } : {}),
                },
                orderBy: [{ grade: 'desc' }, { effectiveFrom: 'desc' }],
            });
            const perDiemRate = dsaRate?.perDiemRate ?? 45000;
            const accommodationRate = dsaRate?.accommodationRate ?? 0;
            const totalAmount = (perDiemRate + accommodationRate) * duration;
            const events = await findEventsForTravel(destination, start, end);
            const requestNumber = generateRequestNumber();
            const dsaRequest = await server_1.prisma.dsaRequest.create({
                data: {
                    employeeId: employee.id,
                    organizationId: employee.organizationId,
                    requestNumber,
                    destination,
                    purpose,
                    startDate: start,
                    endDate: end,
                    duration,
                    perDiemRate,
                    accommodationRate: accommodationRate || null,
                    totalAmount,
                    currency: 'MWK',
                    status: 'PENDING',
                    notes: notes ?? null,
                    travelAuthRef: travelAuthRef ?? null,
                },
                include: {
                    approvals: true,
                },
            });
            await server_1.prisma.notification.create({
                data: {
                    userId: req.user.id,
                    type: 'DSA_REQUEST_SUBMITTED',
                    title: 'DSA Request Submitted',
                    message: `Your request ${requestNumber} for ${destination} (${duration} day${duration !== 1 ? 's' : ''}) has been submitted for approval.`,
                    data: { requestId: dsaRequest.id, requestNumber, totalAmount },
                },
            });
            res.status(201).json({
                success: true,
                message: 'DSA request submitted successfully',
                data: {
                    request: dsaRequest,
                    estimatedAmount: {
                        duration,
                        perDiemRate,
                        accommodationRate,
                        totalAmount,
                    },
                    matchedEvents: events,
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    async cancelRequest(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const { id } = req.params;
            const request = await server_1.prisma.dsaRequest.findFirst({
                where: { id, employeeId: employee.id },
            });
            if (!request)
                return next(new errorHandler_1.AppError('Request not found', 404));
            if (!['DRAFT', 'PENDING'].includes(request.status)) {
                return next(new errorHandler_1.AppError(`Cannot cancel a request with status ${request.status}`, 400));
            }
            const updated = await server_1.prisma.dsaRequest.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });
            res.json({ success: true, message: 'Request cancelled', data: { request: updated } });
        }
        catch (err) {
            next(err);
        }
    }
    async getProfile(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const user = await server_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true, email: true, phone: true,
                    firstName: true, lastName: true, profileImage: true,
                    emailVerified: true, createdAt: true,
                },
            });
            res.json({
                success: true,
                data: {
                    user,
                    employee: {
                        id: employee.id,
                        employeeId: employee.employeeId,
                        jobTitle: employee.jobTitle,
                        grade: employee.grade,
                        bankAccount: employee.bankAccount,
                        mobileMoney: employee.mobileMoney,
                        department: employee.department,
                        organization: {
                            id: employee.organization.id,
                            name: employee.organization.name,
                            type: employee.organization.type,
                        },
                    },
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    async updateProfile(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const { firstName, lastName, phone, profileImage, bankAccount, mobileMoney } = req.body;
            const [updatedUser, updatedEmployee] = await Promise.all([
                server_1.prisma.user.update({
                    where: { id: req.user.id },
                    data: {
                        ...(firstName !== undefined && { firstName }),
                        ...(lastName !== undefined && { lastName }),
                        ...(phone !== undefined && { phone }),
                        ...(profileImage !== undefined && { profileImage }),
                    },
                    select: {
                        id: true, email: true, phone: true,
                        firstName: true, lastName: true, profileImage: true,
                    },
                }),
                server_1.prisma.employee.update({
                    where: { id: employee.id },
                    data: {
                        ...(bankAccount !== undefined && { bankAccount }),
                        ...(mobileMoney !== undefined && { mobileMoney }),
                    },
                }),
            ]);
            res.json({
                success: true,
                data: { user: updatedUser, employee: updatedEmployee },
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getDsaRates(req, res, next) {
        try {
            const employee = await getEmployee(req, next);
            if (!employee)
                return;
            const rates = await server_1.prisma.dsaRate.findMany({
                where: {
                    organizationId: employee.organizationId,
                    effectiveFrom: { lte: new Date() },
                    OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: new Date() } },
                    ],
                },
                orderBy: [{ location: 'asc' }, { grade: 'asc' }],
            });
            res.json({ success: true, data: { rates } });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.EmployeeController = EmployeeController;
exports.default = new EmployeeController();
//# sourceMappingURL=employee.controller.js.map