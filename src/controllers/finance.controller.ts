// src/controllers/finance.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getFinanceOfficer(req: AuthRequest, next: NextFunction) {
  if (!req.user) { next(new AppError('Unauthorized', 401)); return null; }
  const officer = await prisma.financeOfficer.findUnique({
    where: { userId: req.user.id },
    include: { organization: true },
  });
  if (!officer) { next(new AppError('Finance officer profile not found', 404)); return null; }
  return officer;
}

function generateBatchNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BATCH-${ts}-${rand}`;
}

type UploadedDisbursementRow = {
  requestId: string;
  amount?: number;
  paymentMethod?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAccount?: string;
};

async function parseCsvBuffer(buffer: Uint8Array): Promise<UploadedDisbursementRow[]> {
  return new Promise((resolve, reject) => {
    parseCsv(
      Buffer.from(buffer).toString('utf-8'),
      { columns: true, skip_empty_lines: true, trim: true },
      (error, records: UploadedDisbursementRow[]) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(records);
      }
    );
  });
}

async function parseXlsxBuffer(buffer: Uint8Array): Promise<UploadedDisbursementRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim();
  });

  const rows: UploadedDisbursementRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const entry: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      entry[headers[colNumber - 1]] = cell.value ?? null;
    });
    rows.push({
      requestId: String(entry.requestId ?? entry.request_id ?? '').trim(),
      amount: entry.amount != null ? Number(entry.amount) : undefined,
      paymentMethod: entry.paymentMethod != null ? String(entry.paymentMethod) : undefined,
      recipientName: entry.recipientName != null ? String(entry.recipientName) : undefined,
      recipientPhone: entry.recipientPhone != null ? String(entry.recipientPhone) : undefined,
      recipientAccount: entry.recipientAccount != null ? String(entry.recipientAccount) : undefined,
    });
  });

  return rows;
}

async function parseUpload(file: Express.Multer.File): Promise<UploadedDisbursementRow[]> {
  const lower = file.originalname.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return parseXlsxBuffer(file.buffer);
  }
  if (lower.endsWith('.csv')) {
    return parseCsvBuffer(file.buffer);
  }
  throw new AppError('Only .csv and .xlsx files are supported', 400);
}

async function eventInsightsForRequests(
  requests: Array<{ destination: string; startDate: Date; endDate: Date; totalAmount: number }>
) {
  const perRequestEvents = await Promise.all(
    requests.map((request) =>
      prisma.event.findMany({
        where: {
          city: { equals: request.destination, mode: 'insensitive' },
          startDate: { lte: request.endDate },
          endDate: { gte: request.startDate },
        },
        select: { id: true, name: true, city: true, startDate: true, endDate: true, category: true },
        take: 10,
      })
    )
  );

  const regionMap: Record<string, { city: string; count: number; amount: number }> = {};
  perRequestEvents.forEach((events, index) => {
    const request = requests[index];
    if (events.length === 0) return;
    const key = request.destination.toLowerCase();
    if (!regionMap[key]) {
      regionMap[key] = { city: request.destination, count: 0, amount: 0 };
    }
    regionMap[key].count += events.length;
    regionMap[key].amount += request.totalAmount;
  });

  return Object.values(regionMap);
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class FinanceController {

  // ======================
  // 📊 Dashboard
  // ======================
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const orgId = officer.organizationId;

      const [
        pendingDisbursements,
        approvedNotDisbursed,
        activeBatches,
        completedBatches,
        budgets,
        recentBatches,
        paidRequests,
      ] = await Promise.all([
        // Disbursements that are approved but not yet in a batch
        prisma.dsaRequest.count({
          where: {
            organizationId: orgId,
            status: 'APPROVED',
            disbursementItem: null,
          },
        }),
        // Approved amounts total
        prisma.dsaRequest.aggregate({
          where: { organizationId: orgId, status: 'APPROVED', disbursementItem: null },
          _sum: { totalAmount: true },
        }),
        // Active (processing) batches
        prisma.disbursementBatch.count({
          where: { organizationId: orgId, status: 'processing' },
        }),
        // Completed batches this month
        prisma.disbursementBatch.count({
          where: {
            organizationId: orgId,
            status: 'completed',
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        // Budgets summary
        prisma.budget.findMany({
          where: { organizationId: orgId },
          include: { department: { select: { name: true } } },
          orderBy: { fiscalYear: 'desc' },
        }),
        // Recent batches
        prisma.disbursementBatch.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { financeOfficer: { include: { user: { select: { firstName: true, lastName: true } } } } },
        }),
        prisma.dsaRequest.findMany({
          where: { organizationId: orgId, status: 'PAID' },
          select: {
            destination: true,
            startDate: true,
            endDate: true,
            totalAmount: true,
            submittedAt: true,
          },
          take: 250,
          orderBy: { submittedAt: 'desc' },
        }),
      ]);

      // Budget utilization
      const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
      const totalCommitted = budgets.reduce((sum, b) => sum + b.committed, 0);
      const utilizationRate = totalAllocated > 0
        ? parseFloat(((totalSpent / totalAllocated) * 100).toFixed(2))
        : 0;

      // Budget alerts — departments over 80% spent
      const budgetAlerts = budgets.filter(
        (b) => b.allocated > 0 && (b.spent / b.allocated) >= 0.8
      );

      const eventTrends = await eventInsightsForRequests(paidRequests);

      res.json({
        success: true,
        data: {
          stats: {
            pendingDisbursements,
            pendingAmount: approvedNotDisbursed._sum.totalAmount ?? 0,
            activeBatches,
            completedBatchesThisMonth: completedBatches,
            utilizationRate,
            budgetAlertCount: budgetAlerts.length,
          },
          budgets: budgets.map((b) => ({
            id: b.id,
            department: b.department?.name ?? 'Unallocated',
            fiscalYear: b.fiscalYear,
            allocated: b.allocated,
            spent: b.spent,
            committed: b.committed,
            remaining: b.allocated - b.spent - b.committed,
            utilizationPct: b.allocated > 0
              ? parseFloat(((b.spent / b.allocated) * 100).toFixed(2))
              : 0,
          })),
          budgetAlerts: budgetAlerts.map((b) => ({
            id: b.id,
            department: b.department?.name ?? 'Unallocated',
            utilizationPct: parseFloat(((b.spent / b.allocated) * 100).toFixed(2)),
          })),
          recentBatches,
          eventExpenditureTrends: eventTrends,
          summary: {
            totalAllocated,
            totalSpent,
            totalCommitted,
            totalRemaining: totalAllocated - totalSpent - totalCommitted,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 💰 Budgets
  // ======================
  async getBudgets(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { fiscalYear } = req.query as Record<string, string>;

      const where: any = { organizationId: officer.organizationId };
      if (fiscalYear) where.fiscalYear = fiscalYear;

      const budgets = await prisma.budget.findMany({
        where,
        include: { department: { select: { name: true, code: true } } },
        orderBy: [{ fiscalYear: 'desc' }, { departmentId: 'asc' }],
      });

      const enriched = budgets.map((b) => ({
        ...b,
        remaining: b.allocated - b.spent - b.committed,
        utilizationPct: b.allocated > 0
          ? parseFloat(((b.spent / b.allocated) * 100).toFixed(2))
          : 0,
        isAlert: b.allocated > 0 && (b.spent / b.allocated) >= 0.8,
        eventAllocation: b.department?.name
          ? {
              department: b.department.name,
              allocated: b.allocated,
              spent: b.spent,
              committed: b.committed,
            }
          : null,
      }));

      res.json({ success: true, data: { budgets: enriched } });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📥 Ready to Disburse (Approved, not yet in batch)
  // ======================
  async getDisbursements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { page = '1', limit = '25', search } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
      const skip = (pageNum - 1) * take;

      const where: any = {
        organizationId: officer.organizationId,
        status: 'APPROVED',
        disbursementItem: null,
      };

      if (search) {
        where.OR = [
          { destination: { contains: search, mode: 'insensitive' } },
          { purpose: { contains: search, mode: 'insensitive' } },
          { requestNumber: { contains: search, mode: 'insensitive' } },
          { employee: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
          { employee: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const [requests, total, sumAgg] = await Promise.all([
        prisma.dsaRequest.findMany({
          where,
          orderBy: { submittedAt: 'asc' },
          skip,
          take,
          include: {
            employee: {
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
                department: { select: { name: true } },
              },
            },
          },
        }),
        prisma.dsaRequest.count({ where }),
        prisma.dsaRequest.aggregate({ where, _sum: { totalAmount: true } }),
      ]);

      const rows = await Promise.all(
        requests.map(async (request) => {
          const events = await prisma.event.findMany({
            where: {
              city: { equals: request.destination, mode: 'insensitive' },
              startDate: { lte: request.endDate },
              endDate: { gte: request.startDate },
            },
            select: {
              id: true,
              name: true,
              city: true,
              startDate: true,
              endDate: true,
            },
            take: 10,
          });

          const mobileMoney = request.employee.mobileMoney as Record<string, unknown> | null;
          const bankAccount = request.employee.bankAccount as Record<string, unknown> | null;
          const recipientValid = Boolean(
            (mobileMoney && mobileMoney.phoneNumber) ||
            (bankAccount && bankAccount.accountNumber)
          );

          return {
            ...request,
            hasEvents: events.length > 0,
            events,
            recipientValidation: {
              valid: recipientValid,
              hasMobileMoney: Boolean(mobileMoney && mobileMoney.phoneNumber),
              hasBankAccount: Boolean(bankAccount && bankAccount.accountNumber),
            },
          };
        })
      );

      res.json({
        success: true,
        data: {
          requests: rows,
          totalAmount: sumAgg._sum.totalAmount ?? 0,
        },
        meta: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
          hasNext: pageNum * take < total,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📦 Disbursement Batches (list)
  // ======================
  async getBatches(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { page = '1', limit = '20', status } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * take;

      const where: any = { organizationId: officer.organizationId };
      if (status) where.status = status;

      const [batches, total] = await Promise.all([
        prisma.disbursementBatch.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            financeOfficer: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
            items: { select: { status: true } },
          },
        }),
        prisma.disbursementBatch.count({ where }),
      ]);

      const mapped = batches.map((batch) => {
        const successCount = batch.items.filter((item) => item.status === 'success').length;
        const failedCount = batch.items.filter((item) => item.status === 'failed').length;
        const processed = successCount + failedCount;
        const progressPercentage = batch.itemCount > 0 ? Number(((processed / batch.itemCount) * 100).toFixed(2)) : 0;
        return {
          ...batch,
          successCount,
          failedCount,
          progressPercentage,
          items: undefined,
          metadata: batch.metadata ?? {},
        };
      });

      res.json({
        success: true,
        data: {
          batches: mapped,
        },
        meta: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
          hasNext: pageNum * take < total,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📦 Single Batch (detail + items)
  // ======================
  async getBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { id } = req.params;

      const batch = await prisma.disbursementBatch.findFirst({
        where: { id, organizationId: officer.organizationId },
        include: {
          items: {
            include: {
              request: {
                include: {
                  employee: {
                    include: {
                      user: { select: { firstName: true, lastName: true, email: true } },
                      department: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          financeOfficer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      if (!batch) return next(new AppError('Batch not found', 404));

      res.json({ success: true, data: { batch } });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // ➕ Create Disbursement Batch
  // ======================
  async createBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { requestIds, notes } = req.body as { requestIds?: string[]; notes?: string };

      if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
        return next(new AppError('requestIds array is required and must not be empty', 400));
      }

      // Validate all requests belong to this org, are APPROVED, and not yet in a batch
      const requests = await prisma.dsaRequest.findMany({
        where: {
          id: { in: requestIds },
          organizationId: officer.organizationId,
          status: 'APPROVED',
          disbursementItem: null,
        },
        include: {
          employee: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      if (requests.length !== requestIds.length) {
        const foundIds = requests.map((r) => r.id);
        const missing = requestIds.filter((id) => !foundIds.includes(id));
        return next(
          new AppError(
            `Some requests are invalid, already batched, or not approved: ${missing.join(', ')}`,
            400
          )
        );
      }

      const totalAmount = requests.reduce((sum, r) => sum + r.totalAmount, 0);
      const batchNumber = generateBatchNumber();

      // Create batch and all disbursement items in a transaction
      const batch = await prisma.$transaction(async (tx) => {
        const newBatch = await tx.disbursementBatch.create({
          data: {
            organizationId: officer.organizationId,
            financeOfficerId: officer.id,
            batchNumber,
            totalAmount,
            itemCount: requests.length,
            status: 'pending',
            metadata: { notes: notes ?? null, createdBy: req.user!.id },
          },
        });

        // Create a DisbursementItem for each request
        await Promise.all(
          requests.map((r) => {
            const employeeName = `${r.employee.user.firstName ?? ''} ${r.employee.user.lastName ?? ''}`.trim();
            const mobileMoney = r.employee.mobileMoney as any;
            const bankAccount = r.employee.bankAccount as any;

            // Prefer mobile money, fall back to bank
            const paymentMethod = mobileMoney?.provider ? 'mobile_money' : 'bank';
            const recipientPhone = mobileMoney?.phoneNumber ?? null;
            const recipientAccount = bankAccount?.accountNumber ?? null;

            return tx.disbursementItem.create({
              data: {
                batchId: newBatch.id,
                requestId: r.id,
                recipientName: employeeName || r.employee.employeeId,
                recipientPhone,
                recipientAccount,
                amount: r.totalAmount,
                paymentMethod,
                status: 'pending',
              },
            });
          })
        );

        return newBatch;
      });

      res.status(201).json({
        success: true,
        message: `Batch ${batchNumber} created with ${requests.length} items`,
        data: { batch, totalAmount, itemCount: requests.length },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 🔄 Process / Update Batch Status
  // ======================
  async processBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { id } = req.params;
      const { status } = req.body as { status?: string };

      const validStatuses = ['processing', 'completed', 'failed'];
      if (!status || !validStatuses.includes(status)) {
        return next(new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400));
      }

      const batch = await prisma.disbursementBatch.findFirst({
        where: { id, organizationId: officer.organizationId },
      });

      if (!batch) return next(new AppError('Batch not found', 404));

      // Prevent illegal transitions
      if (batch.status === 'completed') {
        return next(new AppError('Batch is already completed', 400));
      }

      const updateData: any = { status };
      if (status === 'completed') {
        updateData.processedAt = new Date();
        // Mark all items as success and DSA requests as PAID
        await prisma.$transaction(async (tx) => {
          await tx.disbursementItem.updateMany({
            where: { batchId: id, status: 'pending' },
            data: { status: 'success', processedAt: new Date() },
          });

          // Get all request IDs from this batch
          const items = await tx.disbursementItem.findMany({
            where: { batchId: id },
            select: { requestId: true },
          });
          const reqIds = items.map((i) => i.requestId);

          await tx.dsaRequest.updateMany({
            where: { id: { in: reqIds } },
            data: { status: 'PAID' },
          });

          await tx.disbursementBatch.update({
            where: { id },
            data: updateData,
          });
        });
      } else {
        await prisma.disbursementBatch.update({ where: { id }, data: updateData });
      }

      const updated = await prisma.disbursementBatch.findUnique({ where: { id } });

      res.json({ success: true, data: { batch: updated } });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // ⬆️ Bulk Disbursement Upload
  // ======================
  async uploadBulkDisbursement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
      if (!file) {
        return next(new AppError('Spreadsheet file is required', 400));
      }

      const rows = await parseUpload(file);
      if (rows.length === 0) {
        return next(new AppError('No rows found in uploaded file', 400));
      }

      const validationErrors: Array<{ row: number; reason: string }> = [];
      const requestIds = rows.map((row) => row.requestId).filter(Boolean);
      const uniqueIds = Array.from(new Set(requestIds));

      const requests = await prisma.dsaRequest.findMany({
        where: {
          id: { in: uniqueIds },
          organizationId: officer.organizationId,
          status: 'APPROVED',
          disbursementItem: null,
        },
        include: {
          employee: true,
        },
      });
      const requestMap = new Map(requests.map((item) => [item.id, item]));

      const validRows = rows
        .map((row, index) => ({ row, index: index + 2 }))
        .filter(({ row, index }) => {
          if (!row.requestId) {
            validationErrors.push({ row: index, reason: 'requestId is required' });
            return false;
          }
          const request = requestMap.get(row.requestId);
          if (!request) {
            validationErrors.push({ row: index, reason: 'Request not found, not approved, already batched, or out of org scope' });
            return false;
          }
          return true;
        });

      if (validRows.length === 0) {
        return next(new AppError('All rows are invalid; no batch created', 400));
      }

      const validRequests = validRows.map(({ row }) => requestMap.get(row.requestId)!);
      const totalAmount = validRequests.reduce((sum, request) => sum + request.totalAmount, 0);
      const batchNumber = generateBatchNumber();

      const batch = await prisma.$transaction(async (tx) => {
        const createdBatch = await tx.disbursementBatch.create({
          data: {
            organizationId: officer.organizationId,
            financeOfficerId: officer.id,
            batchNumber,
            totalAmount,
            itemCount: validRows.length,
            status: 'pending',
            metadata: {
              source: 'bulk_upload',
              fileName: file.originalname,
              totalRows: rows.length,
              acceptedRows: validRows.length,
              rejectedRows: validationErrors.length,
            },
          },
        });

        await Promise.all(
          validRows.map(({ row }) => {
            const request = requestMap.get(row.requestId)!;
            const mobileMoney = request.employee.mobileMoney as Record<string, unknown> | null;
            const bankAccount = request.employee.bankAccount as Record<string, unknown> | null;
            return tx.disbursementItem.create({
              data: {
                batchId: createdBatch.id,
                requestId: request.id,
                recipientName: row.recipientName || request.employee.employeeId,
                recipientPhone: row.recipientPhone || (mobileMoney?.phoneNumber as string | undefined) || null,
                recipientAccount: row.recipientAccount || (bankAccount?.accountNumber as string | undefined) || null,
                amount: row.amount ?? request.totalAmount,
                paymentMethod: row.paymentMethod || ((mobileMoney?.phoneNumber ? 'mobile_money' : 'bank')),
                status: 'pending',
              },
            });
          })
        );

        return createdBatch;
      });

      res.status(201).json({
        success: true,
        data: {
          batch,
          summary: {
            totalRows: rows.length,
            acceptedRows: validRows.length,
            rejectedRows: validationErrors.length,
          },
          errors: validationErrors,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 👤 Finance Officer Profile
  // ======================
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

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
          officer: {
            id: officer.id,
            role: officer.role,
            organization: {
              id: officer.organization.id,
              name: officer.organization.name,
              type: officer.organization.type,
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
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { firstName, lastName, phone, profileImage } = req.body;

      const updatedUser = await prisma.user.update({
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
      });

      res.json({ success: true, data: { user: updatedUser } });
    } catch (err) {
      next(err);
    }
  }
}

export default new FinanceController();
