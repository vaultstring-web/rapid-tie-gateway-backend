// src/controllers/approver.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { prisma } from '../server';
import { AppError } from '../utils/errorHandler';
import { emitNotification } from '../server';

// ─── Helper ──────────────────────────────────────────────────────────────────
async function getApprover(req: AuthRequest, next: NextFunction) {
  const profile = req.user?.approver;
  if (!profile) { next(new AppError('Approver profile not found', 403)); return null; }
  return profile;
}

async function findEventsForDestination(destination: string, startDate?: Date, endDate?: Date) {
  return prisma.event.findMany({
    where: {
      city: { equals: destination, mode: 'insensitive' },
      ...(startDate && endDate
        ? { startDate: { lte: endDate }, endDate: { gte: startDate } }
        : {}),
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
// Add this helper function after the imports, before the ApproverController class
async function enrichRequestsWithEvents<T extends { destination: string; startDate?: Date; endDate?: Date }>(
  requests: T[]
): Promise<(T & { events: any[]; eventCount: number })[]> {
  if (!requests.length) return requests as any;

  // Collect all unique destinations
  const uniqueDestinations = [...new Set(requests.map(r => r.destination))];

  // Single database call for all events
  const allEvents = await prisma.event.findMany({
    where: {
      city: { in: uniqueDestinations, mode: 'insensitive' },
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
  });

  // Build in-memory map: destination -> events
  const eventsByCity = new Map<string, any[]>();
  for (const event of allEvents) {
    if (!eventsByCity.has(event.city)) {
      eventsByCity.set(event.city, []);
    }
    eventsByCity.get(event.city)!.push(event);
  }

  // Process each request with in-memory events
  return requests.map(request => {
    let events = eventsByCity.get(request.destination) || [];
    
    // Filter by date range if provided
    if (request.startDate && request.endDate) {
      events = events.filter(event => 
        event.startDate <= request.endDate! && event.endDate >= request.startDate!
      );
    }
    
    // Sort by start date and limit
    events = events
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 10);
    
    return {
      ...request,
      events,
      eventCount: events.length,
    };
  });
}

export class ApproverController {

  // ======================
  // 📊 Dashboard
  // ======================
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const approverProfile = await getApprover(req, next);
      if (!approverProfile) return;

      const orgId = approverProfile.organizationId;

      const [
        pendingCount,
        approvedCount,
        rejectedCount,
        pendingAmount,
        recentDecisions,
        teamSummary,
        pendingRequests,
      ] = await Promise.all([
        prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'PENDING' } }),
        prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'APPROVED' } }),
        prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'REJECTED' } }),
        prisma.dsaRequest.aggregate({
          where: { organizationId: orgId, status: 'PENDING' },
          _sum: { totalAmount: true },
        }),
        // Recent approval actions by THIS approver
        prisma.approval.findMany({
          where: { approverId: approverProfile.id },
          orderBy: { approvedAt: 'desc' },
          take: 10,
          include: {
            request: {
              include: {
                employee: {
                  include: {
                    user: { select: { firstName: true, lastName: true } },
                    department: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
        // Team summary — pending requests by department
        prisma.department.findMany({
          where: { organizationId: orgId },
          include: {
            employees: {
              include: {
                dsaRequests: {
                  where: { status: { in: ['PENDING', 'APPROVED'] } },
                  select: { status: true },
                },
              },
            },
          },
        }),
        prisma.dsaRequest.findMany({
          where: {
            organizationId: orgId,
            status: 'PENDING',
          },
          select: {
            id: true,
            destination: true,
            startDate: true,
            endDate: true,
          },
          take: 100,
        }),
      ]);

      const total = pendingCount + approvedCount + rejectedCount;
      const approvalRate = total > 0
        ? parseFloat(((approvedCount / total) * 100).toFixed(2))
        : 0;

      const teamData = teamSummary.map((dept) => {
        const allReqs = dept.employees.flatMap((e) => e.dsaRequests);
        return {
          name: dept.name,
          pending: allReqs.filter((r) => r.status === 'PENDING').length,
          approved: allReqs.filter((r) => r.status === 'APPROVED').length,
        };
      });

      const destinationInsights = await enrichRequestsWithEvents(pendingRequests);

      res.json({
        success: true,
        data: {
          stats: {
            pending: pendingCount,
            approved: approvedCount,
            rejected: rejectedCount,
            total,
            approvalRate,
            pendingAmount: pendingAmount._sum.totalAmount ?? 0,
          },
          approvalRateBreakdown: [
            { name: 'Approved', value: approvedCount },
            { name: 'Rejected', value: rejectedCount },
            { name: 'Pending', value: pendingCount },
          ],
          recentDecisions: recentDecisions.map((d) => ({
            id: d.id,
            action: d.status === 'approved' ? 'Approved' : 'Rejected',
            requestId: d.requestId,
            comments: d.comments,
            decidedAt: d.approvedAt,
            employee: {
              firstName: d.request.employee.user.firstName,
              lastName: d.request.employee.user.lastName,
              department: d.request.employee.department?.name ?? null,
            },
            destination: d.request.destination,
            amount: d.request.totalAmount,
          })),
          teamSummary: teamData,
          regionalEventInsights: destinationInsights.filter((item) => item.eventCount > 0),
        },
      });
    } catch (error) {
      next(error);
    }
  }
// ======================
// 📊 Team Summary
// ======================
async getTeamSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const approverProfile = await getApprover(req, next);
    if (!approverProfile) return;

    const orgId = approverProfile.organizationId;

    const teamSummary = await prisma.department.findMany({
      where: { organizationId: orgId },
      include: {
        employees: {
          include: {
            dsaRequests: {
              where: { status: { in: ['PENDING', 'APPROVED'] } },
              select: { status: true },
            },
          },
        },
      },
    });

    const result = teamSummary.map((dept) => {
      const allReqs = dept.employees.flatMap((e) => e.dsaRequests);
      return {
        name: dept.name,
        pending: allReqs.filter((r) => r.status === 'PENDING').length,
        approved: allReqs.filter((r) => r.status === 'APPROVED').length,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ======================
// 📋 Recent Decisions
// ======================
async getRecentDecisions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const approverProfile = await getApprover(req, next);
    if (!approverProfile) return;

    const limit = parseInt(req.query.limit as string) || 10;

    const recentDecisions = await prisma.approval.findMany({
      where: { approverId: approverProfile.id },
      orderBy: { approvedAt: 'desc' },
      take: limit,
      include: {
        request: {
          include: {
            employee: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const result = recentDecisions.map((d) => ({
      id: d.id,
      action: d.status === 'approved' ? 'Approved' : 'Rejected',
      requestId: d.requestId,
      comments: d.comments,
      decidedAt: d.approvedAt,
      employee: {
        firstName: d.request.employee.user.firstName,
        lastName: d.request.employee.user.lastName,
        department: d.request.employee.department?.name ?? null,
      },
      destination: d.request.destination,
      amount: d.request.totalAmount,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ======================
// 📊 Approval Stats
// ======================
async getApprovalStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const approverProfile = await getApprover(req, next);
    if (!approverProfile) return;

    const orgId = approverProfile.organizationId;

    const pendingCount = await prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'PENDING' } });
    const approvedCount = await prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'APPROVED' } });
    const rejectedCount = await prisma.dsaRequest.count({ where: { organizationId: orgId, status: 'REJECTED' } });
    const pendingAmount = await prisma.dsaRequest.aggregate({
      where: { organizationId: orgId, status: 'PENDING' },
      _sum: { totalAmount: true },
    });

    const total = pendingCount + approvedCount + rejectedCount;
    const approvalRate = total > 0 ? parseFloat(((approvedCount / total) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total,
        approvalRate,
        pendingAmount: pendingAmount._sum.totalAmount ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
} 

  // ======================
  // 📋 All Requests (any status, paginated)
  // ======================
  async getAllRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const approverProfile = await getApprover(req, next);
      if (!approverProfile) return;

      const { page = '1', status, search } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = 20;
      const skip = (pageNum - 1) * take;

      const where: any = { organizationId: approverProfile.organizationId };
      if (status && status !== 'all') where.status = status.toUpperCase();
      if (search) {
        where.OR = [
          { destination: { contains: search, mode: 'insensitive' } },
          { purpose: { contains: search, mode: 'insensitive' } },
          { requestNumber: { contains: search, mode: 'insensitive' } },
          { employee: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
          { employee: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const [requests, total] = await Promise.all([
        prisma.dsaRequest.findMany({
          where,
          include: {
            employee: {
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
                department: { select: { name: true } },
              },
            },
            approvals: {
              where: { approverId: approverProfile.id },
              select: { status: true, level: true, comments: true },
            },
          },
          orderBy: { submittedAt: 'desc' },
          skip,
          take,
        }),
        prisma.dsaRequest.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          requests: requests.map((r) => ({
            id: r.id,
            requestNumber: r.requestNumber,
            destination: r.destination,
            purpose: r.purpose,
            startDate: r.startDate,
            endDate: r.endDate,
            duration: r.duration,
            totalAmount: r.totalAmount,
            currency: r.currency,
            status: r.status,
            submittedAt: r.submittedAt,
            employee: {
              firstName: r.employee.user.firstName,
              lastName: r.employee.user.lastName,
              email: r.employee.user.email,
              department: r.employee.department?.name ?? null,
            },
            myApproval: r.approvals[0] ?? null,
          })),
          pagination: {
            total,
            page: pageNum,
            perPage: take,
            totalPages: Math.ceil(total / take),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
// ======================
// 📥 Pending Requests
// ======================
async getPending(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const approverProfile = req.user?.approver;
    if (!approverProfile) return next(new AppError('Approver profile not found', 403));

    const { department, startDate, endDate } = req.query as Record<string, string>;
    const where: any = {
      organizationId: approverProfile.organizationId,
      status: 'PENDING',
    };

    if (department) {
      where.employee = {
        department: {
          name: { contains: department, mode: 'insensitive' },
        },
      };
    }

    if (startDate || endDate) {
      where.AND = [
        startDate ? { startDate: { gte: new Date(startDate) } } : {},
        endDate ? { endDate: { lte: new Date(endDate) } } : {},
      ];
    }

    const requests = await prisma.dsaRequest.findMany({
      where: {
        ...where,
      },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            department: { select: { name: true } },
          },
        },
        approvals: {
          where: { approverId: approverProfile.id },
          select: { status: true, level: true, comments: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // OPTIMIZED: Single database call for all events instead of N+1
    if (requests.length > 0) {
      const uniqueDestinations = [...new Set(requests.map(r => r.destination))];
      
      const allEvents = await prisma.event.findMany({
        where: {
          city: { in: uniqueDestinations, mode: 'insensitive' },
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
      });

      // Build in-memory map: destination -> events
      const eventsByCity = new Map<string, any[]>();
      for (const event of allEvents) {
        if (!eventsByCity.has(event.city)) {
          eventsByCity.set(event.city, []);
        }
        eventsByCity.get(event.city)!.push(event);
      }

      // Process each request with in-memory events (no additional DB calls)
      const rows = requests.map(request => {
        let events = eventsByCity.get(request.destination) || [];
        
        // Filter by date range (in-memory)
        events = events.filter(event => 
          event.startDate <= request.endDate && event.endDate >= request.startDate
        );
        
        // Sort and limit
        events = events
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
          .slice(0, 10);

        return {
          id: request.id,
          requestNumber: request.requestNumber,
          destination: request.destination,
          purpose: request.purpose,
          startDate: request.startDate,
          endDate: request.endDate,
          duration: request.duration,
          totalAmount: request.totalAmount,
          currency: request.currency,
          status: request.status,
          submittedAt: request.submittedAt,
          employee: {
            firstName: request.employee.user.firstName,
            lastName: request.employee.user.lastName,
            email: request.employee.user.email,
            department: request.employee.department?.name ?? null,
          },
          myApproval: request.approvals[0] ?? null,
          hasRelatedEvents: events.length > 0,
          eventCount: events.length,
          events,
        };
      });

      res.json({
        success: true,
        data: rows,
      });
    } else {
      // No pending requests
      res.json({
        success: true,
        data: [],
      });
    }
  } catch (error) {
    next(error);
  }
}
  // ======================
  // 📄 Single Request Detail
  // ======================
  async getDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const approverProfile = req.user?.approver;
      if (!approverProfile) return next(new AppError('Approver profile not found', 403));

      const { id } = req.params;

      const request = await prisma.dsaRequest.findFirst({
        where: { id, organizationId: approverProfile.organizationId },
        include: {
          employee: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
              department: { select: { name: true } },
            },
          },
          approvals: {
            include: {
              approver: {
                include: { user: { select: { firstName: true, lastName: true } } },
              },
            },
            orderBy: { level: 'asc' },
          },
        },
      });

      if (!request) return next(new AppError('Request not found', 404));
      const events = await findEventsForDestination(request.destination, request.startDate, request.endDate);
      const dsaBreakdown = {
        duration: request.duration,
        perDiemRate: request.perDiemRate,
        accommodationRate: request.accommodationRate ?? 0,
        totalAmount: request.totalAmount,
      };

      res.json({
        success: true,
        data: {
          request,
          events,
          dsaBreakdown,
          approverComments: request.approvals
            .filter((approval) => Boolean(approval.comments))
            .map((approval) => ({
              approver: `${approval.approver.user.firstName ?? ''} ${approval.approver.user.lastName ?? ''}`.trim(),
              level: approval.level,
              status: approval.status,
              comments: approval.comments,
              approvedAt: approval.approvedAt,
            })),
          supportingDocuments: {
            travelAuthRef: request.travelAuthRef ?? null,
            notes: request.notes ?? null,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

// ======================
// ✅ / ❌ Approve / Reject
// ======================
processAction(
  action: 'approve' | 'reject'
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const approverProfile = req.user?.approver;
      if (!approverProfile) return next(new AppError('Approver profile not found', 403));

      const { id } = req.params;
      const { comments } = req.body as { comments?: string };

      const dsaRequest = await prisma.dsaRequest.findFirst({
        where: { id, organizationId: approverProfile.organizationId },
        include: {
          employee: {
            include: {
              department: true,
            },
          },
        },
      });

      if (!dsaRequest) return next(new AppError('Request not found', 404));
      
      if (dsaRequest.status !== 'PENDING') {
        return next(new AppError(`Request is already ${dsaRequest.status.toLowerCase()}`, 400));
      }

      // Check if approval record already exists
      const existingApproval = await prisma.approval.findFirst({
        where: {
          requestId: id,
          approverId: approverProfile.id,
        },
      });

      if (existingApproval) {
        return next(new AppError('You have already processed this request', 409));
      }

      // ======================
      // BUDGET CHECK FOR APPROVALS
      // ======================
      if (action === 'approve') {
        // Generate fiscal year (e.g., "2026-2027" based on current date)
        const currentYear = new Date().getFullYear();
        const fiscalYear = `${currentYear}-${currentYear + 1}`;

        // Find the budget for the employee's department
        const budget = await prisma.budget.findFirst({
          where: {
            organizationId: approverProfile.organizationId,
            departmentId: dsaRequest.employee.departmentId || undefined,
            fiscalYear: fiscalYear,
          },
        });

        if (!budget) {
          return next(new AppError('No budget found for this department', 422));
        }

        const availableBudget = budget.allocated - budget.spent - budget.committed;
        
        if (availableBudget < dsaRequest.totalAmount) {
          return next(new AppError(
            `Insufficient budget. Available: MWK ${availableBudget.toLocaleString()}, Required: MWK ${dsaRequest.totalAmount.toLocaleString()}`,
            422
          ));
        }

        // Increment committed amount in budget
        await prisma.budget.update({
          where: { id: budget.id },
          data: {
            committed: { increment: dsaRequest.totalAmount },
          },
        });
      }

      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const newRequestStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

      // Create approval record
      await prisma.approval.create({
        data: {
          requestId: id,
          approverId: approverProfile.id,
          level: approverProfile.approvalLevel,
          status: approvalStatus,
          comments: comments ?? null,
          approvedAt: new Date(),
        },
      });

      await prisma.dsaRequest.update({
        where: { id },
        data: { status: newRequestStatus, updatedAt: new Date() },
      });

            // Notify the employee via database and real-time WebSocket
      const request = await prisma.dsaRequest.findUnique({
        where: { id },
        include: { employee: { include: { user: { select: { id: true } } } } },
      });
      if (request) {
        const notification = await prisma.notification.create({
          data: {
            userId: request.employee.user.id,
            type: action === 'approve' ? 'DSA_APPROVED' : 'DSA_REJECTED',
            title: action === 'approve' ? 'DSA Request Approved' : 'DSA Request Rejected',
            message: `Your request ${dsaRequest.requestNumber} for ${dsaRequest.destination} has been ${approvalStatus}.${comments ? ` Comment: ${comments}` : ''}`,
            data: { requestId: id, requestNumber: dsaRequest.requestNumber },
          },
        }).catch(() => null);
        
        // Send real-time WebSocket notification
        if (notification) {
          emitNotification(request.employee.user.id, notification);
        }
      }

      res.json({
        success: true,
        message: `Request ${approvalStatus} successfully`,
        data: { requestId: id, status: newRequestStatus },
      });
    } catch (error) {
      next(error);
    }
  };
}
  // ======================
  // 👤 Approver Profile
  // ======================
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const approverProfile = req.user.approver;
      if (!approverProfile) return next(new AppError('Approver profile not found', 403));

      const [user, fullProfile] = await Promise.all([
        prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            id: true, email: true, phone: true,
            firstName: true, lastName: true, profileImage: true,
            emailVerified: true, createdAt: true,
          },
        }),
        prisma.approver.findUnique({
          where: { id: approverProfile.id },
          include: { organization: { select: { id: true, name: true, type: true } } },
        }),
      ]);

      res.json({ success: true, data: { user, approver: fullProfile } });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const { firstName, lastName, phone, profileImage } = req.body;

      const updatedUser = await prisma.user.update({
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
      });

      res.json({ success: true, data: { user: updatedUser } });
    } catch (error) {
      next(error);
    }
  }
}