// src/controllers/finance.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse';
import { emitNotification } from '../server';

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

type UploadedConfirmationRow = {
  requestId: string;
  providerRef: string;
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

async function parseConfirmationUpload(file: Express.Multer.File): Promise<UploadedConfirmationRow[]> {
  const rows = await parseUpload(file);
  // Reuse the same parser (CSV/XLSX) but require providerRef.
  return rows
    .map((r: any) => ({
      requestId: String(r.requestId ?? '').trim(),
      providerRef: String(r.providerRef ?? r.transactionRef ?? r.reference ?? '').trim(),
    }))
    .filter((r) => Boolean(r.requestId) && Boolean(r.providerRef));
}

// REPLACE the entire eventInsightsForRequests function with:
async function eventInsightsForRequests(
  requests: Array<{ destination: string; startDate: Date; endDate: Date; totalAmount: number }>
) {
  if (!requests.length) return [];

  // Collect all unique destinations
  const uniqueDestinations = [...new Set(requests.map(r => r.destination))];

  // Single database call
  const allEvents = await prisma.event.findMany({
    where: {
      city: { in: uniqueDestinations, mode: 'insensitive' },
    },
    select: { id: true, name: true, city: true, startDate: true, endDate: true, category: true },
  });

  // Build in-memory map: destination -> events
  const eventsByCity = new Map<string, any[]>();
  for (const event of allEvents) {
    if (!eventsByCity.has(event.city)) {
      eventsByCity.set(event.city, []);
    }
    eventsByCity.get(event.city)!.push(event);
  }

  // Process each request (in-memory filtering)
  const perRequestEvents = requests.map(request => {
    let events = eventsByCity.get(request.destination) || [];
    events = events.filter(event => 
      event.startDate <= request.endDate && event.endDate >= request.startDate
    ).slice(0, 10);
    return events;
  });

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
        prisma.dsaRequest.count({
          where: {
            organizationId: orgId,
            status: 'APPROVED',
            disbursementItem: null,
          },
        }),
        prisma.dsaRequest.aggregate({
          where: { organizationId: orgId, status: 'APPROVED', disbursementItem: null },
          _sum: { totalAmount: true },
        }),
        prisma.disbursementBatch.count({
          where: { organizationId: orgId, status: 'processing' },
        }),
        prisma.disbursementBatch.count({
          where: {
            organizationId: orgId,
            status: 'completed',
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        prisma.budget.findMany({
          where: { organizationId: orgId },
          include: { department: { select: { name: true } } },
          orderBy: { fiscalYear: 'desc' },
        }),
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

      const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
      const totalCommitted = budgets.reduce((sum, b) => sum + b.committed, 0);
      const utilizationRate = totalAllocated > 0
        ? parseFloat(((totalSpent / totalAllocated) * 100).toFixed(2))
        : 0;

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

    // OPTIMIZATION: Single database call for all events instead of N+1
    const uniqueDestinations = [...new Set(requests.map(r => r.destination))];
    
    const allEvents = await prisma.event.findMany({
      where: {
        city: { in: uniqueDestinations, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        city: true,
        startDate: true,
        endDate: true,
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

    // Process rows using in-memory data (no additional DB calls)
    const rows = requests.map((request) => {
      let events = eventsByCity.get(request.destination) || [];
      events = events
        .filter(event => 
          event.startDate <= request.endDate && event.endDate >= request.startDate
        )
        .slice(0, 10);

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
    });

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

        await Promise.all(
          requests.map((r) => {
            const employeeName = `${r.employee.user.firstName ?? ''} ${r.employee.user.lastName ?? ''}`.trim();
            const mobileMoney = r.employee.mobileMoney as any;
            const bankAccount = r.employee.bankAccount as any;

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

      const validStatuses = ['processing', 'pending_confirmation', 'failed'];
      if (!status || !validStatuses.includes(status)) {
        return next(new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400));
      }

      const batch = await prisma.disbursementBatch.findFirst({
        where: { id, organizationId: officer.organizationId },
        include: {
          items: {
            include: {
              request: {
                include: {
                  employee: {
                    include: {
                      department: true,
                      user: { select: { id: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) return next(new AppError('Batch not found', 404));

      if (batch.status === 'completed') {
        return next(new AppError('Batch is already completed', 400));
      }

      // Option B: do NOT auto-complete to PAID. Completion requires manual confirmation upload.
      await prisma.disbursementBatch.update({
        where: { id },
        data: { status },
      });

      const updated = await prisma.disbursementBatch.findUnique({ where: { id } });

      res.json({ success: true, data: { batch: updated } });
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📎 Confirm Batch From Upload (Option B)
  // ======================
  async confirmBatchFromUpload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { id } = req.params;
      const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
      if (!file) {
        return next(new AppError('Confirmation file is required (.csv or .xlsx)', 400));
      }

      const rows = await parseConfirmationUpload(file);
      if (rows.length === 0) {
        return next(new AppError('No valid confirmation rows found (require requestId + providerRef)', 400));
      }

      const batch = await prisma.disbursementBatch.findFirst({
        where: { id, organizationId: officer.organizationId },
        include: { items: true },
      });
      if (!batch) return next(new AppError('Batch not found', 404));
      if (batch.status === 'completed') return next(new AppError('Batch is already completed', 400));

      const batchItemByRequest = new Map(batch.items.map((i) => [i.requestId, i]));

      const invalid: Array<{ requestId: string; reason: string }> = [];
      const confirmable = rows.filter((r) => {
        const item = batchItemByRequest.get(r.requestId);
        if (!item) {
          invalid.push({ requestId: r.requestId, reason: 'Request not in this batch' });
          return false;
        }
        if (item.status === 'success') {
          invalid.push({ requestId: r.requestId, reason: 'Already confirmed' });
          return false;
        }
        return true;
      });

      const fiscalYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

      const result = await prisma.$transaction(async (tx) => {
        for (const row of confirmable) {
          const item = await tx.disbursementItem.update({
            where: { requestId: row.requestId },
            data: {
              status: 'success',
              providerRef: row.providerRef,
              processedAt: new Date(),
              errorMessage: null,
            },
            include: {
              request: {
                include: {
                  employee: { include: { user: { select: { id: true } } } },
                },
              },
            },
          });

          // Budget move committed -> spent
          const request = await tx.dsaRequest.findUnique({
            where: { id: row.requestId },
            include: { employee: true },
          });
          if (request?.employee?.departmentId) {
            const budget = await tx.budget.findFirst({
              where: {
                organizationId: officer.organizationId,
                departmentId: request.employee.departmentId,
                fiscalYear,
              },
            });
            if (budget) {
              await tx.budget.update({
                where: { id: budget.id },
                data: {
                  spent: { increment: item.amount },
                  committed: { decrement: item.amount },
                },
              });
            }
          }

          await tx.dsaRequest.update({
            where: { id: row.requestId },
            data: { status: 'PAID' },
          });

          const userId = item.request?.employee?.user?.id;
          if (userId && item.request) {
            const notification = await tx.notification.create({
              data: {
                userId,
                type: 'DSA_PAID',
                title: 'DSA Payment Processed',
                message: `Your DSA request ${item.request.requestNumber} for ${item.request.destination} has been paid. Amount: MWK ${item.request.totalAmount.toLocaleString()}`,
                data: { requestId: item.request.id, requestNumber: item.request.requestNumber, batchId: id },
              },
            });
            emitNotification(userId, notification);
          }
        }

        const refreshedItems = await tx.disbursementItem.findMany({ where: { batchId: id } });
        const allConfirmed = refreshedItems.length > 0 && refreshedItems.every((i) => i.status === 'success');

        const updatedBatch = await tx.disbursementBatch.update({
          where: { id },
          data: {
            status: allConfirmed ? 'completed' : 'pending_confirmation',
            processedAt: allConfirmed ? new Date() : null,
          },
        });

        return { updatedBatch, allConfirmed };
      });

      res.json({
        success: true,
        data: {
          batch: result.updatedBatch,
          allConfirmed: result.allConfirmed,
          confirmedCount: confirmable.length,
          invalid,
        },
      });
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
  // ======================
  // 💰 DSA Rates Management
  // ======================

  // GET /api/finance/rates - List all DSA rates
  async getDsaRates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { location, grade, page = '1', limit = '50' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * take;

      const where: any = {
        organizationId: officer.organizationId,
      };

      if (location) {
        where.location = { contains: location, mode: 'insensitive' };
      }
      if (grade) {
        where.grade = grade;
      }

      const [rates, totalCount] = await Promise.all([
        prisma.dsaRate.findMany({
          where,
          orderBy: [{ location: 'asc' }, { grade: 'asc' }],
          skip,
          take,
        }),
        prisma.dsaRate.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          rates,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / take),
            totalItems: totalCount,
            itemsPerPage: take,
            hasNextPage: pageNum * take < totalCount,
            hasPrevPage: pageNum > 1,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/finance/rates - Create new DSA rate
  async createDsaRate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { location, grade, perDiemRate, accommodationRate, effectiveFrom, effectiveTo } = req.body;

      if (!location || !perDiemRate || !effectiveFrom) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: location, perDiemRate, effectiveFrom',
        });
        return;
      }

      // Check if rate already exists for this location and grade
      const existingRate = await prisma.dsaRate.findFirst({
        where: {
          organizationId: officer.organizationId,
          location,
          grade: grade || null,
          effectiveFrom: { lte: new Date(effectiveFrom) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(effectiveFrom) } }],
        },
      });

      if (existingRate) {
        res.status(409).json({
          success: false,
          message: 'A DSA rate already exists for this location and grade during this period',
        });
        return;
      }

      const newRate = await prisma.dsaRate.create({
        data: {
          organizationId: officer.organizationId,
          location,
          grade: grade || null,
          perDiemRate,
          accommodationRate: accommodationRate || null,
          effectiveFrom: new Date(effectiveFrom),
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'DSA_RATE_CREATED',
          entity: 'DsaRate',
          entityId: newRate.id,
          newValue: { location, grade, perDiemRate, accommodationRate },
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        success: true,
        message: 'DSA rate created successfully',
        data: newRate,
      });
    } catch (err) {
      next(err);
    }
  }

  // PUT /api/finance/rates/:id - Update DSA rate
  async updateDsaRate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { id } = req.params;
      const { location, grade, perDiemRate, accommodationRate, effectiveFrom, effectiveTo } = req.body;

      const existingRate = await prisma.dsaRate.findFirst({
        where: { id, organizationId: officer.organizationId },
      });

      if (!existingRate) {
        res.status(404).json({ success: false, message: 'DSA rate not found' });
        return;
      }

      const updatedRate = await prisma.dsaRate.update({
        where: { id },
        data: {
          location: location !== undefined ? location : undefined,
          grade: grade !== undefined ? grade : undefined,
          perDiemRate: perDiemRate !== undefined ? perDiemRate : undefined,
          accommodationRate: accommodationRate !== undefined ? accommodationRate : undefined,
          effectiveFrom: effectiveFrom !== undefined ? new Date(effectiveFrom) : undefined,
          effectiveTo: effectiveTo !== undefined ? (effectiveTo ? new Date(effectiveTo) : null) : undefined,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'DSA_RATE_UPDATED',
          entity: 'DsaRate',
          entityId: updatedRate.id,
          newValue: { location, grade, perDiemRate, accommodationRate },
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
        message: 'DSA rate updated successfully',
        data: updatedRate,
      });
    } catch (err) {
      next(err);
    }
  }

  // DELETE /api/finance/rates/:id - Delete DSA rate
  async deleteDsaRate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { id } = req.params;

      const existingRate = await prisma.dsaRate.findFirst({
        where: { id, organizationId: officer.organizationId },
      });

      if (!existingRate) {
        res.status(404).json({ success: false, message: 'DSA rate not found' });
        return;
      }

      await prisma.dsaRate.delete({ where: { id } });

      await prisma.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'DSA_RATE_DELETED',
          entity: 'DsaRate',
          entityId: existingRate.id,
          oldValue: { location: existingRate.location, grade: existingRate.grade },
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
        message: 'DSA rate deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }  
    // ======================
  // 📊 Export Disbursement Batch to CSV/XLSX
  // ======================
  async exportDisbursementBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { batchId } = req.query;
      const format = (req.query.format as string) || 'csv';

      if (!batchId) {
        res.status(400).json({ success: false, message: 'batchId is required' });
        return;
      }

      // Fetch batch with all related data
      const batch = await prisma.disbursementBatch.findFirst({
        where: { id: batchId as string, organizationId: officer.organizationId },
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

      if (!batch) {
        res.status(404).json({ success: false, message: 'Batch not found' });
        return;
      }

      // Prepare data for export
      const exportData = batch.items.map(item => ({
        'Request ID': item.requestId,
        'Request Number': item.request?.requestNumber || 'N/A',
        'Employee Name': item.request?.employee?.user?.firstName && item.request?.employee?.user?.lastName
          ? `${item.request.employee.user.firstName} ${item.request.employee.user.lastName}`
          : item.request?.employee?.user?.email || 'N/A',
        'Department': item.request?.employee?.department?.name || 'N/A',
        'Destination': item.request?.destination || 'N/A',
        'Purpose': item.request?.purpose || 'N/A',
        'Travel Dates': item.request?.startDate && item.request?.endDate
          ? `${new Date(item.request.startDate).toLocaleDateString()} - ${new Date(item.request.endDate).toLocaleDateString()}`
          : 'N/A',
        'Amount (MWK)': item.amount,
        'Payment Method': item.paymentMethod,
        'Recipient Name': item.recipientName,
        'Recipient Phone': item.recipientPhone || 'N/A',
        'Recipient Account': item.recipientAccount || 'N/A',
        'Status': item.status,
        'Processed At': item.processedAt ? new Date(item.processedAt).toLocaleString() : 'Pending',
      }));

      // Add batch summary
      const summary = {
        'Batch Number': batch.batchNumber,
        'Created By': batch.financeOfficer?.user?.firstName && batch.financeOfficer?.user?.lastName
          ? `${batch.financeOfficer.user.firstName} ${batch.financeOfficer.user.lastName}`
          : 'N/A',
        'Created At': new Date(batch.createdAt).toLocaleString(),
        'Processed At': batch.processedAt ? new Date(batch.processedAt).toLocaleString() : 'Not processed',
        'Status': batch.status,
        'Total Items': batch.itemCount,
        'Total Amount (MWK)': batch.totalAmount,
      };

      if (format === 'xlsx') {
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        
        // Summary sheet
        const summarySheet = workbook.addWorksheet('Batch Summary');
        const summaryHeaders = Object.keys(summary);
        summarySheet.addRow(summaryHeaders);
        summarySheet.addRow(Object.values(summary));
        summarySheet.getRow(1).font = { bold: true };
        
        // Adjust column widths
        summarySheet.columns.forEach(col => {
          col.width = 25;
        });

        // Transactions sheet
        const transactionsSheet = workbook.addWorksheet('Transactions');
        const headers = Object.keys(exportData[0] || {});
        transactionsSheet.addRow(headers);
        transactionsSheet.getRow(1).font = { bold: true };
        
        exportData.forEach(row => {
          transactionsSheet.addRow(Object.values(row));
        });
        
        // Adjust column widths for transactions
        transactionsSheet.columns.forEach(col => {
          col.width = 20;
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=batch-${batch.batchNumber}-${Date.now()}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
      } else {
        // Generate CSV
        const csvHeaders = Object.keys(exportData[0] || {}).join(',');
        const csvRows = exportData.map(row => Object.values(row).join(','));
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        
        // Add summary as comments at the top
        const summaryLines = Object.entries(summary).map(([key, value]) => `# ${key}: ${value}`);
        const finalCsv = summaryLines.join('\n') + '\n\n' + csvContent;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=batch-${batch.batchNumber}-${Date.now()}.csv`);
        res.send(finalCsv);
      }
    } catch (err) {
      next(err);
    }
  }

  // ======================
  // 📊 Export Budget Utilization Report
  // ======================
  async exportBudgetReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const officer = await getFinanceOfficer(req, next);
      if (!officer) return;

      const { fiscalYear, format = 'csv' } = req.query;

      const where: any = { organizationId: officer.organizationId };
      if (fiscalYear) where.fiscalYear = fiscalYear;

      const budgets = await prisma.budget.findMany({
        where,
        include: {
          department: { select: { name: true, code: true } },
        },
        orderBy: [{ fiscalYear: 'desc' }, { departmentId: 'asc' }],
      });

      // Prepare export data
      const exportData = budgets.map(budget => ({
        'Fiscal Year': budget.fiscalYear,
        'Department': budget.department?.name || 'Unallocated',
        'Department Code': budget.department?.code || 'N/A',
        'Allocated (MWK)': budget.allocated,
        'Spent (MWK)': budget.spent,
        'Committed (MWK)': budget.committed,
        'Remaining (MWK)': budget.allocated - budget.spent - budget.committed,
        'Utilization %': budget.allocated > 0 
          ? ((budget.spent / budget.allocated) * 100).toFixed(2) 
          : '0',
        'Commitment %': budget.allocated > 0
          ? ((budget.committed / budget.allocated) * 100).toFixed(2)
          : '0',
        'Status': (budget.spent / budget.allocated) >= 0.9 ? 'Critical' 
          : (budget.spent / budget.allocated) >= 0.75 ? 'Warning' 
          : 'Healthy',
      }));

      // Calculate summary totals
      const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
      const totalCommitted = budgets.reduce((sum, b) => sum + b.committed, 0);
      const totalRemaining = totalAllocated - totalSpent - totalCommitted;
      const overallUtilization = totalAllocated > 0 ? ((totalSpent / totalAllocated) * 100).toFixed(2) : '0';

      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        
        // Summary sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.addRow(['Metric', 'Value']);
        summarySheet.addRow(['Total Allocated (MWK)', totalAllocated]);
        summarySheet.addRow(['Total Spent (MWK)', totalSpent]);
        summarySheet.addRow(['Total Committed (MWK)', totalCommitted]);
        summarySheet.addRow(['Total Remaining (MWK)', totalRemaining]);
        summarySheet.addRow(['Overall Utilization %', overallUtilization]);
        summarySheet.addRow(['Generated On', new Date().toLocaleString()]);
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.columns.forEach(col => {
          col.width = 25;
        });

        // Budget Details sheet
        const detailsSheet = workbook.addWorksheet('Budget Details');
        const headers = Object.keys(exportData[0] || {});
        detailsSheet.addRow(headers);
        detailsSheet.getRow(1).font = { bold: true };
        
        exportData.forEach(row => {
          detailsSheet.addRow(Object.values(row));
        });
        
        detailsSheet.columns.forEach(col => {
          col.width = 18;
        });

        // Alert sheet (departments with high utilization)
        const alertsSheet = workbook.addWorksheet('Alerts');
        alertsSheet.addRow(['Department', 'Utilization %', 'Status', 'Remaining (MWK)']);
        alertsSheet.getRow(1).font = { bold: true };
        
        budgets.forEach(budget => {
          const utilization = budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0;
          if (utilization >= 75) {
            alertsSheet.addRow([
              budget.department?.name || 'Unallocated',
              utilization.toFixed(2),
              utilization >= 90 ? 'Critical' : 'Warning',
              budget.allocated - budget.spent - budget.committed,
            ]);
          }
        });
        
        alertsSheet.columns.forEach(col => {
          col.width = 20;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=budget-report-${Date.now()}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
      } else {
        // Generate CSV
        const csvHeaders = Object.keys(exportData[0] || {}).join(',');
        const csvRows = exportData.map(row => Object.values(row).join(','));
        
        // Add summary at the top
        const summaryLines = [
          `# Budget Report Generated: ${new Date().toLocaleString()}`,
          `# Total Allocated: MWK ${totalAllocated.toLocaleString()}`,
          `# Total Spent: MWK ${totalSpent.toLocaleString()}`,
          `# Total Committed: MWK ${totalCommitted.toLocaleString()}`,
          `# Total Remaining: MWK ${totalRemaining.toLocaleString()}`,
          `# Overall Utilization: ${overallUtilization}%`,
          '',
          csvHeaders,
          ...csvRows,
        ];
        
        const csvContent = summaryLines.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=budget-report-${Date.now()}.csv`);
        res.send(csvContent);
      }
    } catch (err) {
      next(err);
    }
  }
}

export default new FinanceController();