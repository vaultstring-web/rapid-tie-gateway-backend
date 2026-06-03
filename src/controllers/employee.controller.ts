// src/controllers/employee.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import { enrichRequestsWithEvents } from '../utils/eventHelpers';
import { DocumentService } from '../services/document.service';
import path from 'path';
import fs from 'fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getEmployee(req: AuthRequest, next: NextFunction) {
  if (!req.user) { next(new AppError('Unauthorized', 401)); return null; }
  const employee = await prisma.employee.findUnique({
    where: { userId: req.user.id },
    include: {
      organization: true,
      department: { select: { id: true, name: true, code: true } },
    },
  });
  if (!employee) { next(new AppError('Employee profile not found', 404)); return null; }
  return employee;
}

function generateRequestNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DSA-${ts}-${rand}`;
}

async function findEventsForTravel(destination: string, startDate: Date, endDate: Date) {
  return prisma.event.findMany({
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

// ─── Controller ───────────────────────────────────────────────────────────────

export class EmployeeController {

  // ======================
  // 📊 Dashboard
  // ======================
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const [
        pendingRequests,
        approvedRequests,
        paidRequests,
        pendingAmountAgg,
        recentRequests,
        recentPayments,
        latestDepartmentBudget,
      ] = await Promise.all([
        prisma.dsaRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
        prisma.dsaRequest.count({ where: { employeeId: employee.id, status: 'APPROVED' } }),
        prisma.dsaRequest.findMany({
          where: { employeeId: employee.id, status: 'PAID' },
          select: { totalAmount: true },
        }),
        prisma.dsaRequest.aggregate({
          where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] } },
          _sum: { totalAmount: true },
        }),
        prisma.dsaRequest.findMany({
          where: { employeeId: employee.id },
          orderBy: { submittedAt: 'desc' },
          take: 5,
          include: {
            approvals: { select: { status: true, level: true, comments: true } },
          },
        }),
        prisma.disbursementItem.findMany({
          where: { request: { employeeId: employee.id } },
          include: {
            request: { select: { id: true, requestNumber: true, destination: true, totalAmount: true, currency: true } },
            batch: { select: { id: true, batchNumber: true, processedAt: true } },
          },
          orderBy: { processedAt: 'desc' },
          take: 5,
        }),
        prisma.budget.findFirst({
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

      const destinationSet = Array.from(
        new Set(
          recentRequests
            .map((item) => item.destination?.trim())
            .filter((v): v is string => Boolean(v))
        )
      );

      let destinationEvents: any[] = [];
      if (destinationSet.length > 0) {
        const events = await prisma.event.findMany({
          where: {
            city: { in: destinationSet, mode: 'insensitive' },
            startDate: { gte: new Date() },
          },
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
        });

        const eventsByCity = new Map<string, any[]>();
        for (const event of events) {
          if (!eventsByCity.has(event.city)) {
            eventsByCity.set(event.city, []);
          }
          eventsByCity.get(event.city)!.push(event);
        }

        destinationEvents = destinationSet.flatMap(dest => 
          (eventsByCity.get(dest) || []).slice(0, 3)
        );
      }

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
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📋 My DSA Requests (list)
  // ======================
  async getMyRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { page = '1', limit = '20', status, search } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * take;

      const where: any = { employeeId: employee.id };
      if (status && status !== 'all') where.status = status.toUpperCase();
      if (search) {
        where.OR = [
          { destination: { contains: search, mode: 'insensitive' } },
          { purpose: { contains: search, mode: 'insensitive' } },
          { requestNumber: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [requests, total] = await Promise.all([
        prisma.dsaRequest.findMany({
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
        prisma.dsaRequest.count({ where }),
      ]);

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

        const eventsByCity = new Map<string, any[]>();
        for (const event of allEvents) {
          if (!eventsByCity.has(event.city)) {
            eventsByCity.set(event.city, []);
          }
          eventsByCity.get(event.city)!.push(event);
        }

        const requestsWithEvents = requests.map(request => {
          let events = eventsByCity.get(request.destination) || [];
          events = events.filter(event => 
            event.startDate <= request.endDate && event.endDate >= request.startDate
          );
          events = events
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
            .slice(0, 10);

          const approvalTimeline = request.approvals.map((approval: any) => ({
            level: approval.level,
            status: approval.status,
            comments: approval.comments,
            approvedAt: approval.approvedAt,
            approverName: approval.approver?.user
              ? `${approval.approver.user.firstName ?? ''} ${approval.approver.user.lastName ?? ''}`.trim() || null
              : null,
          }));

          return {
            ...request,
            events,
            approvalTimeline,
          };
        });

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
      } else {
        res.json({
          success: true,
          data: {
            requests: [],
          },
          meta: {
            page: pageNum,
            limit: take,
            total: 0,
            totalPages: 0,
            hasNext: false,
          },
        });
      }
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📄 Single DSA Request (detail)
  // ======================
  async getRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { id } = req.params;

      const request = await prisma.dsaRequest.findFirst({
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

      if (!request) return next(new AppError('Request not found', 404));

      const enriched = await enrichRequestsWithEvents([request]);
      const events = enriched[0]?.events || [];
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

      // Process documents with signed URLs
      const documents = ((request.documents as any[]) || []).map((doc: any) => ({
        ...doc,
        url: DocumentService.getSignedUrl(doc.url),
      }));

      res.json({
        success: true,
        data: {
          request: { ...request, documents },
          events,
          approvalChain,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // ➕ Create DSA Request
  // ======================
  async createRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { destination, purpose, startDate, endDate, notes, travelAuthRef } = req.body;

      if (!destination || !purpose || !startDate || !endDate) {
        return next(new AppError('destination, purpose, startDate and endDate are required', 400));
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return next(new AppError('Invalid date format', 400));
      }
      if (start > end) {
        return next(new AppError('startDate cannot be after endDate', 400));
      }

      const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const dsaRate = await prisma.dsaRate.findFirst({
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

      if (!dsaRate) {
        return next(new AppError('No DSA rate found for this destination and grade. Please contact finance officer.', 400));
      }
      const perDiemRate = dsaRate.perDiemRate;
      const accommodationRate = dsaRate?.accommodationRate ?? 0;
      const totalAmount = (perDiemRate + accommodationRate) * duration;
      const events = await findEventsForTravel(destination, start, end);

      const requestNumber = generateRequestNumber();

      const dsaRequest = await prisma.dsaRequest.create({
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

      await prisma.notification.create({
        data: {
          userId: req.user!.id,
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
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // ✏️ Update DSA Request (only when PENDING)
  // ======================
  async updateRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { id } = req.params;
      const { destination, purpose, startDate, endDate, notes, travelAuthRef } = req.body;

      const existingRequest = await prisma.dsaRequest.findFirst({
        where: { id, employeeId: employee.id },
      });

      if (!existingRequest) {
        return next(new AppError('Request not found', 404));
      }

      if (existingRequest.status !== 'PENDING') {
        return next(new AppError(`Cannot edit request with status ${existingRequest.status}. Only PENDING requests can be modified.`, 403));
      }

      const existingDisbursement = await prisma.disbursementItem.findFirst({
        where: { requestId: id },
      });

      if (existingDisbursement) {
        return next(new AppError('Cannot edit request that is already in a disbursement batch', 403));
      }

      let start = existingRequest.startDate;
      let end = existingRequest.endDate;
      let duration = existingRequest.duration;
      let perDiemRate = existingRequest.perDiemRate;
      let accommodationRate = existingRequest.accommodationRate;
      let totalAmount = existingRequest.totalAmount;

      if (startDate || endDate || destination) {
        start = startDate ? new Date(startDate) : existingRequest.startDate;
        end = endDate ? new Date(endDate) : existingRequest.endDate;
        const newDestination = destination || existingRequest.destination;

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return next(new AppError('Invalid date format', 400));
        }
        if (start > end) {
          return next(new AppError('startDate cannot be after endDate', 400));
        }

        duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const dsaRate = await prisma.dsaRate.findFirst({
          where: {
            organizationId: employee.organizationId,
            location: { equals: newDestination, mode: 'insensitive' },
            effectiveFrom: { lte: start },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: start } },
            ],
            ...(employee.grade ? { OR: [{ grade: employee.grade }, { grade: null }] } : {}),
          },
          orderBy: [{ grade: 'desc' }, { effectiveFrom: 'desc' }],
        });

        if (!dsaRate) {
          return next(new AppError('No DSA rate found for this destination and grade. Please contact finance officer.', 400));
        }

        perDiemRate = dsaRate.perDiemRate;
        accommodationRate = dsaRate.accommodationRate ?? 0;
        totalAmount = (perDiemRate + accommodationRate) * duration;
      }

      const updatedRequest = await prisma.dsaRequest.update({
        where: { id },
        data: {
          destination: destination !== undefined ? destination : undefined,
          purpose: purpose !== undefined ? purpose : undefined,
          startDate: startDate !== undefined ? start : undefined,
          endDate: endDate !== undefined ? end : undefined,
          duration,
          perDiemRate,
          accommodationRate: accommodationRate || null,
          totalAmount,
          notes: notes !== undefined ? notes : undefined,
          travelAuthRef: travelAuthRef !== undefined ? travelAuthRef : undefined,
          updatedAt: new Date(),
        },
      });

      await prisma.notification.create({
        data: {
          userId: req.user!.id,
          type: 'DSA_REQUEST_UPDATED',
          title: 'DSA Request Updated',
          message: `Your request ${existingRequest.requestNumber} has been updated.`,
          data: { requestId: updatedRequest.id, requestNumber: existingRequest.requestNumber },
        },
      });

      res.json({
        success: true,
        message: 'DSA request updated successfully',
        data: {
          request: updatedRequest,
          recalculatedAmount: {
            duration,
            perDiemRate,
            accommodationRate,
            totalAmount,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📎 Upload Document to DSA Request
  // ======================
  async uploadDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { id } = req.params;
      const file = (req as any).file;

      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const existingRequest = await prisma.dsaRequest.findFirst({
        where: { id, employeeId: employee.id },
      });

      if (!existingRequest) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return next(new AppError('Request not found', 404));
      }

      if (!['PENDING', 'DRAFT'].includes(existingRequest.status)) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return next(new AppError(`Cannot upload documents to request with status ${existingRequest.status}`, 403));
      }

      const newDocument = {
        id: `${Date.now()}_${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
        url: `/uploads/dsa-documents/${file.filename}`,
      };

      const existingDocuments = (existingRequest.documents as any[]) || [];
      
      await prisma.dsaRequest.update({
        where: { id },
        data: {
          documents: [...existingDocuments, newDocument],
        },
      });

      await prisma.notification.create({
        data: {
          userId: req.user!.id,
          type: 'DSA_DOCUMENT_UPLOADED',
          title: 'Document Uploaded',
          message: `Document "${file.originalname}" has been uploaded to request ${existingRequest.requestNumber}`,
          data: { requestId: id, filename: file.originalname },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: {
          document: {
            ...newDocument,
            url: DocumentService.getSignedUrl(newDocument.url),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 🗑️ Delete Document from DSA Request
  // ======================
  async deleteDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { id, documentId } = req.params;

      const existingRequest = await prisma.dsaRequest.findFirst({
        where: { id, employeeId: employee.id },
      });

      if (!existingRequest) {
        return next(new AppError('Request not found', 404));
      }

      const documents = (existingRequest.documents as any[]) || [];
      const documentToDelete = documents.find(doc => doc.id === documentId);

      if (!documentToDelete) {
        return next(new AppError('Document not found', 404));
      }

      const filePath = path.join(process.cwd(), 'uploads', 'dsa-documents', documentToDelete.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const updatedDocuments = documents.filter(doc => doc.id !== documentId);

      await prisma.dsaRequest.update({
        where: { id },
        data: { documents: updatedDocuments },
      });

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // ❌ Cancel DSA Request
  // ======================
  async cancelRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { id } = req.params;

      const request = await prisma.dsaRequest.findFirst({
        where: { id, employeeId: employee.id },
      });

      if (!request) return next(new AppError('Request not found', 404));

      if (!['DRAFT', 'PENDING'].includes(request.status)) {
        return next(new AppError(`Cannot cancel a request with status ${request.status}`, 400));
      }

      const updated = await prisma.dsaRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      res.json({ success: true, message: 'Request cancelled', data: { request: updated } });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 💰 Payments
  // ======================
  async getPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { page = '1', limit = '20' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * take;

      const [items, total] = await Promise.all([
        prisma.disbursementItem.findMany({
          where: { request: { employeeId: employee.id } },
          include: {
            request: { select: { id: true, requestNumber: true, destination: true, totalAmount: true, currency: true } },
            batch: { select: { id: true, batchNumber: true, processedAt: true } },
          },
          orderBy: { processedAt: 'desc' },
          skip,
          take,
        }),
        prisma.disbursementItem.count({
          where: { request: { employeeId: employee.id } }
        })
      ]);

      res.json({
        success: true,
        data: {
          payments: items.map(item => ({
            id: item.id,
            status: item.status,
            amount: item.amount,
            paymentMethod: item.paymentMethod,
            processedAt: item.processedAt,
            request: item.request,
            batch: item.batch,
            reference: item.request?.requestNumber || item.id,
          })),
          total
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 👤 Employee Profile
  // ======================
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
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
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { firstName, lastName, phone, profileImage, bankAccount, mobileMoney } = req.body;

      const [updatedUser, updatedEmployee] = await Promise.all([
        prisma.user.update({
          where: { id: req.user!.id },
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
        prisma.employee.update({
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
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 💰 DSA Rates (for the calculation preview)
  // ======================
  async getDsaRates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { destination, grade } = req.query;

      if (destination && grade) {
        const rate = await prisma.dsaRate.findFirst({
          where: {
            organizationId: employee.organizationId,
            location: {
              equals: destination as string,
              mode: 'insensitive',
            },
            grade: grade as string,
            effectiveFrom: { lte: new Date() },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date() } },
            ],
          },
        });

        res.json({
          success: true,
          data: {
            perDiem: rate ? rate.perDiemRate : 0,
            accommodation: rate ? (rate.accommodationRate || 0) : 0,
          },
        });
        return;
      }

      const rates = await prisma.dsaRate.findMany({
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
    } catch (err) {
      next(err);
    }
  }

  async getMatchingEvents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await getEmployee(req, next);
      if (!employee) return;

      const { destination, startDate, endDate } = req.query;

      if (!destination || !startDate || !endDate) {
        res.json({ success: true, data: [] });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.json({ success: true, data: [] });
        return;
      }

      const events = await findEventsForTravel(destination as string, start, end);
      res.json({ success: true, data: events });
    } catch (err) {
      next(err);
    }
  }
}

export default new EmployeeController();