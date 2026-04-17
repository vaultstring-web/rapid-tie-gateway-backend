// src/controllers/merchant.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import { cache } from '../utils/cache';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { stringify } from 'csv-stringify/sync';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Ensure the authenticated user has a linked Merchant record. */
async function getMerchant(req: AuthRequest, next: NextFunction) {
  if (!req.user) { next(new AppError('Unauthorized', 401)); return null; }
  const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
  if (!merchant) { next(new AppError('Merchant profile not found', 404)); return null; }
  return merchant;
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNumberInput(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeUrlValue(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function getTransactionMetadata(metadata: unknown) {
  return (metadata ?? {}) as Record<string, any>;
}

function getPaymentLinkIdFromMetadata(metadata: unknown): string | null {
  const meta = getTransactionMetadata(metadata);
  return meta.paymentLinkId ?? meta.payment_link_id ?? null;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export class MerchantController {

  /**
   * GET /api/merchant/dashboard
   * Aggregate revenue (30 days), success rate, recent 10 transactions,
   * and upcoming events relevant to merchant's industry.
   * Cached for 5 minutes.
   */
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const cacheKey = `merchant-dashboard-${merchant.id}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        res.json({ ...JSON.parse(cached as string), cached: true });
        return;
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const eventFilters = [];
      if (merchant.businessType) {
        eventFilters.push({ category: { contains: merchant.businessType, mode: 'insensitive' as const } });
      }
      if (merchant.city) {
        eventFilters.push({ city: { equals: merchant.city, mode: 'insensitive' as const } });
      }

      const [revenueAgg, totalCount, successCount, recentTransactions, upcomingEvents, paymentLinkSummary] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            merchantId: merchant.id,
            status: 'success',
            createdAt: { gte: thirtyDaysAgo },
          },
          _sum: { amount: true, fee: true, netAmount: true },
          _count: { id: true },
        }),
        prisma.transaction.count({
          where: { merchantId: merchant.id, createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.transaction.count({
          where: { merchantId: merchant.id, status: 'success', createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.transaction.findMany({
          where: { merchantId: merchant.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, transactionRef: true, amount: true, fee: true, netAmount: true,
            currency: true, status: true, paymentMethod: true, provider: true,
            createdAt: true, metadata: true,
          },
        }),
        prisma.event.findMany({
          where: {
            status: 'PUBLISHED',
            startDate: { gte: new Date() },
            ...(eventFilters.length > 0 ? { OR: eventFilters } : {}),
          },
          orderBy: { startDate: 'asc' },
          take: 5,
          select: {
            id: true, name: true, category: true, venue: true, city: true,
            startDate: true, endDate: true, coverImage: true, amount: true,
          },
        }),
        prisma.paymentLink.aggregate({
          where: { merchantId: merchant.id, active: true },
          _count: { id: true },
          _sum: { views: true, conversions: true },
        }),
      ]);

      const successRate = totalCount > 0 ? parseFloat(((successCount / totalCount) * 100).toFixed(2)) : 0;

      const data = {
        success: true,
        data: {
          revenue: {
            last30Days: revenueAgg._sum.amount ?? 0,
            fees: revenueAgg._sum.fee ?? 0,
            netAmount: revenueAgg._sum.netAmount ?? 0,
            transactionCount: revenueAgg._count.id,
          },
          successRate,
          recentTransactions,
          upcomingEvents,
          paymentLinks: {
            activeCount: paymentLinkSummary._count.id,
            totalViews: paymentLinkSummary._sum.views ?? 0,
            totalConversions: paymentLinkSummary._sum.conversions ?? 0,
          },
        },
      };

      cache.set(cacheKey, JSON.stringify(data), 300); // 5 min TTL
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  /**
   * POST /api/merchant/analytics
   * Accepts { startDate, endDate, status?, paymentMethod?, export? }
   * Returns time-series data and event-related analytics.
   * Supports CSV export.
   */
  async getAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { startDate, endDate, status, paymentMethod, eventId, exportCsv } = req.body;

      if (!startDate || !endDate) {
        return next(new AppError('startDate and endDate are required', 400));
      }

      const from = new Date(startDate);
      const to = new Date(endDate);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return next(new AppError('Invalid date format', 400));
      }
      if (from > to) {
        return next(new AppError('startDate cannot be after endDate', 400));
      }

      const where: any = {
        merchantId: merchant.id,
        createdAt: { gte: from, lte: to },
      };
      if (status) where.status = status;
      if (paymentMethod) where.paymentMethod = paymentMethod;

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, transactionRef: true, amount: true, fee: true, netAmount: true,
          status: true, paymentMethod: true, provider: true,
          currency: true, createdAt: true, metadata: true,
        },
      });

      const eventLinks = await prisma.paymentLink.findMany({
        where: {
          merchantId: merchant.id,
          eventId: eventId ?? { not: null },
        },
        include: {
          event: {
            select: { id: true, name: true, category: true, startDate: true, endDate: true },
          },
        },
      });

      const eventLinkMap = new Map<string, (typeof eventLinks)[number]>(
        eventLinks.map((link: (typeof eventLinks)[number]): [string, (typeof eventLinks)[number]] => [link.id, link]),
      );
      const filteredTransactions = eventId
        ? transactions.filter((tx: (typeof transactions)[number]) => {
            const paymentLinkId = getPaymentLinkIdFromMetadata(tx.metadata);
            return paymentLinkId ? eventLinkMap.has(paymentLinkId) : false;
          })
        : transactions;

      // Build daily time-series
      const seriesMap: Record<string, { date: string; revenue: number; count: number; fees: number }> = {};
      for (const tx of filteredTransactions) {
        const day = tx.createdAt.toISOString().slice(0, 10);
        if (!seriesMap[day]) seriesMap[day] = { date: day, revenue: 0, count: 0, fees: 0 };
        seriesMap[day].revenue += tx.amount;
        seriesMap[day].fees += tx.fee;
        seriesMap[day].count += 1;
      }
      const timeSeries = Object.values(seriesMap);

      // Payment method breakdown
      const methodBreakdown: Record<string, { count: number; amount: number }> = {};
      for (const tx of filteredTransactions) {
        const m = tx.paymentMethod;
        if (!methodBreakdown[m]) methodBreakdown[m] = { count: 0, amount: 0 };
        methodBreakdown[m].count += 1;
        methodBreakdown[m].amount += tx.amount;
      }

      // Status breakdown
      const statusBreakdown: Record<string, number> = {};
      for (const tx of filteredTransactions) {
        statusBreakdown[tx.status] = (statusBreakdown[tx.status] ?? 0) + 1;
      }

      const eventSalesMap: Record<string, {
        eventId: string;
        eventName: string;
        category: string;
        transactionCount: number;
        revenue: number;
        fees: number;
        netAmount: number;
        paymentLinks: number;
        totalViews: number;
        totalConversions: number;
      }> = {};

      for (const link of eventLinks) {
        if (!link.event) continue;
        if (!eventSalesMap[link.event.id]) {
          eventSalesMap[link.event.id] = {
            eventId: link.event.id,
            eventName: link.event.name,
            category: link.event.category,
            transactionCount: 0,
            revenue: 0,
            fees: 0,
            netAmount: 0,
            paymentLinks: 0,
            totalViews: 0,
            totalConversions: 0,
          };
        }
        eventSalesMap[link.event.id].paymentLinks += 1;
        eventSalesMap[link.event.id].totalViews += link.views;
        eventSalesMap[link.event.id].totalConversions += link.conversions;
      }

      for (const tx of filteredTransactions) {
        const paymentLinkId = getPaymentLinkIdFromMetadata(tx.metadata);
        if (!paymentLinkId) continue;
        const link = eventLinkMap.get(paymentLinkId);
        if (!link?.event) continue;
        const bucket = eventSalesMap[link.event.id];
        bucket.transactionCount += 1;
        bucket.revenue += tx.amount;
        bucket.fees += tx.fee;
        bucket.netAmount += tx.netAmount;
      }

      const eventAnalytics = Object.values(eventSalesMap).sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = filteredTransactions.reduce((sum: number, transaction: (typeof filteredTransactions)[number]) => sum + transaction.amount, 0);
      const totalFees = filteredTransactions.reduce((sum: number, transaction: (typeof filteredTransactions)[number]) => sum + transaction.fee, 0);
      const totalNet = filteredTransactions.reduce((sum: number, transaction: (typeof filteredTransactions)[number]) => sum + transaction.netAmount, 0);

      // CSV export
      if (exportCsv === true || exportCsv === 'true') {
        const rows = filteredTransactions.map((t: (typeof filteredTransactions)[number]) => {
          const paymentLinkId = getPaymentLinkIdFromMetadata(t.metadata);
          const linkedEvent = paymentLinkId ? eventLinkMap.get(paymentLinkId)?.event : null;
          return {
          Date: t.createdAt.toISOString(),
          Reference: t.transactionRef,
          TransactionId: t.id,
          Amount: t.amount,
          Fee: t.fee,
          NetAmount: t.netAmount,
          Currency: t.currency,
          Status: t.status,
          PaymentMethod: t.paymentMethod,
          Provider: t.provider ?? '',
          EventName: linkedEvent?.name ?? '',
          EventCategory: linkedEvent?.category ?? '',
          };
        });
        const csv = stringify(rows, { header: true });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.csv"`);
        res.send(csv);
        return;
      }

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenue,
            totalFees,
            totalNet,
            transactionCount: filteredTransactions.length,
          },
          timeSeries,
          methodBreakdown,
          statusBreakdown,
          eventAnalytics: {
            linkedPaymentLinks: eventLinks.length,
            salesDuringEvents: eventAnalytics.reduce((sum, entry) => sum + entry.revenue, 0),
            events: eventAnalytics,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── All Transactions ───────────────────────────────────────────────────────

  /**
   * GET /api/merchant/transactions
   * Pagination (25/page), filtering by date/status/amount/eventId,
   * search by customer name or transaction ref.
   */
  async getTransactions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const {
        page = '1', status, paymentMethod, startDate, endDate,
        minAmount, maxAmount, eventId, search,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const take = 25;
      const skip = (pageNum - 1) * take;
      const parsedStartDate = parseDateInput(startDate);
      const parsedEndDate = parseDateInput(endDate);
      const parsedMinAmount = parseNumberInput(minAmount);
      const parsedMaxAmount = parseNumberInput(maxAmount);

      if (startDate && !parsedStartDate) return next(new AppError('Invalid startDate', 400));
      if (endDate && !parsedEndDate) return next(new AppError('Invalid endDate', 400));
      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return next(new AppError('startDate cannot be after endDate', 400));
      }
      if (minAmount && parsedMinAmount === null) return next(new AppError('Invalid minAmount', 400));
      if (maxAmount && parsedMaxAmount === null) return next(new AppError('Invalid maxAmount', 400));
      if (parsedMinAmount !== null && parsedMaxAmount !== null && parsedMinAmount > parsedMaxAmount) {
        return next(new AppError('minAmount cannot be greater than maxAmount', 400));
      }

      const where: any = { merchantId: merchant.id };

      if (status) where.status = status;
      if (paymentMethod) where.paymentMethod = paymentMethod;
      if (startDate || endDate) {
        where.createdAt = {};
        if (parsedStartDate) where.createdAt.gte = parsedStartDate;
        if (parsedEndDate) where.createdAt.lte = parsedEndDate;
      }
      if (minAmount || maxAmount) {
        where.amount = {};
        if (parsedMinAmount !== null) where.amount.gte = parsedMinAmount;
        if (parsedMaxAmount !== null) where.amount.lte = parsedMaxAmount;
      }

      if (eventId || search) {
        const [eventLinks, candidateTransactions] = await Promise.all([
          eventId
            ? prisma.paymentLink.findMany({
                where: { merchantId: merchant.id, eventId },
                select: { id: true },
              })
            : Promise.resolve([]),
          prisma.transaction.findMany({
            where,
            select: { id: true, transactionRef: true, metadata: true },
          }),
        ]);

        const eventLinkIds = new Set<string>(eventLinks.map((link: (typeof eventLinks)[number]) => link.id));
        const searchLower = search?.trim().toLowerCase();
        const matchedIds = candidateTransactions.filter((transaction: (typeof candidateTransactions)[number]) => {
          const metadata = getTransactionMetadata(transaction.metadata);
          const paymentLinkId = getPaymentLinkIdFromMetadata(transaction.metadata);
          const matchesEvent = eventId ? Boolean(paymentLinkId && eventLinkIds.has(paymentLinkId)) : true;
          const matchesSearch = searchLower
            ? [
                transaction.id,
                transaction.transactionRef,
                metadata.customerName,
                metadata.customerEmail,
                metadata.customerId,
              ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(searchLower))
            : true;
          return matchesEvent && matchesSearch;
        }).map((transaction: (typeof candidateTransactions)[number]) => transaction.id);

        where.id = { in: matchedIds };
      }

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { refunds: true, auditLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
        }),
        prisma.transaction.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            page: pageNum,
            perPage: take,
            totalPages: Math.ceil(total / take),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Transaction Detail ─────────────────────────────────────────────────────

  /**
   * GET /api/merchant/transactions/:id
   * Full transaction + audit log timeline + associated event + refund eligibility.
   */
  async getTransactionById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { id } = req.params;

      const transaction = await prisma.transaction.findFirst({
        where: { id, merchantId: merchant.id },
        include: {
          refunds: true,
          auditLogs: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!transaction) return next(new AppError('Transaction not found', 404));

      // Linked event via paymentLink metadata
      let associatedEvent = null;
      let associatedPaymentLink = null;
      const paymentLinkId = getPaymentLinkIdFromMetadata(transaction.metadata);
      if (paymentLinkId) {
        const pl = await prisma.paymentLink.findUnique({
          where: { id: paymentLinkId },
          include: { event: true },
        });
        associatedPaymentLink = pl ? {
          id: pl.id,
          title: pl.title,
          linkUrl: pl.linkUrl,
          views: pl.views,
          conversions: pl.conversions,
          active: pl.active,
        } : null;
        associatedEvent = pl?.event ?? null;
      }

      // Refund eligibility: success, not already refunded, within 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const alreadyRefunded = transaction.refunds.some((r: (typeof transaction.refunds)[number]) =>
        r.status === 'completed' && r.amount >= transaction.amount,
      );
      const partiallyRefunded = transaction.refunds
        .filter((r: (typeof transaction.refunds)[number]) => r.status === 'completed')
        .reduce((sum: number, refund: (typeof transaction.refunds)[number]) => sum + refund.amount, 0);
      const refundableAmount = transaction.amount - partiallyRefunded;

      const refundEligibility = {
        eligible:
          transaction.status === 'success' &&
          !alreadyRefunded &&
          transaction.createdAt >= thirtyDaysAgo,
        reason: alreadyRefunded
          ? 'Already fully refunded'
          : transaction.status !== 'success'
          ? 'Transaction not successful'
          : transaction.createdAt < thirtyDaysAgo
          ? 'Outside 30-day refund window'
          : null,
        refundableAmount: Math.max(0, refundableAmount),
        alreadyRefunded: partiallyRefunded,
      };

      res.json({
        success: true,
        data: {
          transaction,
          auditTimeline: transaction.auditLogs,
          associatedEvent,
          associatedPaymentLink,
          refundEligibility,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Payment Links ──────────────────────────────────────────────────────────

  /**
   * GET /api/merchant/payment-links
   * Paginated list with view/conversion tracking. Optional eventId filter.
   */
  async getPaymentLinks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { page = '1', eventId, active } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = 25;
      const skip = (pageNum - 1) * take;

      const where: any = { merchantId: merchant.id };
      if (eventId) where.eventId = eventId;
      if (active !== undefined) where.active = active === 'true';

      const [links, total, summary] = await Promise.all([
        prisma.paymentLink.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { event: { select: { id: true, name: true, startDate: true, category: true } } },
        }),
        prisma.paymentLink.count({ where }),
        prisma.paymentLink.aggregate({
          where,
          _sum: { views: true, conversions: true },
          _count: { id: true },
        }),
      ]);

      res.json({
        success: true,
        data: {
          paymentLinks: links.map((link: (typeof links)[number]) => ({
            ...link,
            conversionRate: link.views > 0
              ? parseFloat(((link.conversions / link.views) * 100).toFixed(2))
              : 0,
          })),
          summary: {
            totalLinks: summary._count.id,
            activeLinks: links.filter((link: (typeof links)[number]) => link.active).length,
            totalViews: summary._sum.views ?? 0,
            totalConversions: summary._sum.conversions ?? 0,
          },
          pagination: {
            total,
            page: pageNum,
            perPage: take,
            totalPages: Math.ceil(total / take),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/merchant/payment-links
   * Create a new payment link, optionally tied to an event.
   */
  async createPaymentLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const {
        title, description, amount, currency = 'MWK',
        singleUse = false, expiresAt, eventId, metadata,
      } = req.body;

      if (!title) return next(new AppError('title is required', 400));
      const parsedAmount = amount === undefined ? null : parseNumberInput(amount);
      if (amount !== undefined && parsedAmount === null) {
        return next(new AppError('Amount must be a valid number', 400));
      }
      if (parsedAmount !== null && parsedAmount <= 0) {
        return next(new AppError('Amount must be greater than zero', 400));
      }
      const parsedExpiry = expiresAt ? parseDateInput(expiresAt) : null;
      if (expiresAt && !parsedExpiry) {
        return next(new AppError('Invalid expiresAt date', 400));
      }

      // Verify event belongs to this merchant's payment links (if provided)
      if (eventId) {
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return next(new AppError('Event not found', 404));
      }

      const linkToken = crypto.randomBytes(16).toString('hex');
      const baseUrl = process.env.FRONTEND_URL ?? 'https://pay.rapidtie.com';
      const linkUrl = `${baseUrl}/pay/${linkToken}`;

      const link = await prisma.paymentLink.create({
        data: {
          merchantId: merchant.id,
          title: String(title).trim(),
          description: description?.trim() || null,
          amount: parsedAmount,
          currency: String(currency).trim().toUpperCase(),
          linkToken,
          linkUrl,
          singleUse,
          expiresAt: parsedExpiry,
          eventId: eventId ?? null,
          metadata: metadata ?? undefined,
        },
        include: { event: { select: { id: true, name: true } } },
      });

      cache.del(`merchant-dashboard-${merchant.id}`);
      res.status(201).json({ success: true, data: { paymentLink: link } });
    } catch (err) {
      next(err);
    }
  }

  // ─── Refunds ────────────────────────────────────────────────────────────────

  /**
   * POST /api/merchant/refunds
   * Process full or partial refund, update transaction status, notify customer.
   */
  async processRefund(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { transactionId, amount, reason } = req.body;

      if (!transactionId) return next(new AppError('transactionId is required', 400));
      const refundAmount = parseNumberInput(amount);
      if (refundAmount === null || refundAmount <= 0) return next(new AppError('Valid amount is required', 400));

      const transaction = await prisma.transaction.findFirst({
        where: { id: transactionId, merchantId: merchant.id },
        include: { refunds: true },
      });

      if (!transaction) return next(new AppError('Transaction not found', 404));
      if (transaction.status !== 'success') return next(new AppError('Only successful transactions can be refunded', 400));

      const alreadyRefunded = transaction.refunds
        .filter((refund: (typeof transaction.refunds)[number]) => refund.status === 'completed')
        .reduce((sum: number, refund: (typeof transaction.refunds)[number]) => sum + refund.amount, 0);
      const refundable = transaction.amount - alreadyRefunded;

      if (refundAmount > refundable) {
        return next(new AppError(`Refund amount exceeds refundable balance of ${refundable}`, 400));
      }

      // Create refund record and update transaction status in a transaction
      const [refund] = await prisma.$transaction([
        prisma.refund.create({
          data: {
            transactionId,
            amount: refundAmount,
            reason: reason ?? null,
            status: 'pending',
          },
        }),
        prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: refundAmount >= refundable ? 'refunded' : 'success',
            updatedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            transactionId,
            userId: req.user!.id,
            action: 'REFUND_INITIATED',
            status: 'pending',
            details: { amount: refundAmount, reason, refundableBalance: refundable },
          },
        }),
      ]);

      // TODO: integrate actual payment provider refund API here
      // For now, mark as completed immediately (sandbox)
      const completedRefund = await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'completed' },
      });

      await prisma.auditLog.create({
        data: {
          transactionId,
          userId: req.user!.id,
          action: 'REFUND_COMPLETED',
          status: 'completed',
          details: { refundId: refund.id, amount: refundAmount },
        },
      });

      cache.del(`merchant-dashboard-${merchant.id}`);

      // Notification to customer
      const meta = transaction.metadata as any;
      if (meta?.customerEmail) {
        await prisma.notification.create({
          data: {
            userId: req.user!.id,
            type: 'REFUND_PROCESSED',
            title: 'Refund Processed',
            message: `A refund of ${refundAmount} ${transaction.currency} has been processed for transaction ${transaction.transactionRef}.`,
            data: { refundId: refund.id, transactionRef: transaction.transactionRef },
          },
        });
      }

      res.json({ success: true, data: { refund: completedRefund } });
    } catch (err) {
      next(err);
    }
  }

  // ─── API Keys ───────────────────────────────────────────────────────────────

  /**
   * GET /api/merchant/api-keys – list keys
   * POST /api/merchant/api-keys – create key
   * DELETE /api/merchant/api-keys/:id – revoke key
   */
  async listApiKeys(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const keys = await prisma.apiKey.findMany({
        where: { merchantId: merchant.id },
        select: {
          id: true, name: true, lastUsed: true, expiresAt: true,
          permissions: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const formatted = keys.map((k: (typeof keys)[number]) => ({
        ...k,
        keyPreview: 'Only shown when the key is created',
      }));

      res.json({ success: true, data: { apiKeys: formatted } });
    } catch (err) {
      next(err);
    }
  }

  async createApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { name, permissions, expiresAt } = req.body;
      if (!name) return next(new AppError('Key name is required', 400));
      const parsedExpiry = expiresAt ? parseDateInput(expiresAt) : null;
      if (expiresAt && !parsedExpiry) return next(new AppError('Invalid expiresAt date', 400));

      // Generate a secure key: prefix_randomhex
      const rawKey = `rtk_${crypto.randomBytes(32).toString('hex')}`;
      const hashedKey = await bcrypt.hash(rawKey, 10);

      const apiKey = await prisma.apiKey.create({
        data: {
          merchantId: merchant.id,
          name: String(name).trim(),
          key: hashedKey,
          permissions: permissions ?? [],
          expiresAt: parsedExpiry,
        },
      });

      // Return raw key ONCE only – cannot be recovered after this
      res.status(201).json({
        success: true,
        data: {
          apiKey: { ...apiKey, key: rawKey },
          warning: 'Store this key securely. It will not be shown again.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { id } = req.params;
      const key = await prisma.apiKey.findFirst({ where: { id, merchantId: merchant.id } });
      if (!key) return next(new AppError('API key not found', 404));

      await prisma.apiKey.delete({ where: { id } });
      res.json({ success: true, message: 'API key revoked' });
    } catch (err) {
      next(err);
    }
  }

  // ─── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * GET  /api/merchant/webhooks        – list webhooks
   * POST /api/merchant/webhooks        – create webhook
   * PUT  /api/merchant/webhooks/:id    – update webhook
   * DELETE /api/merchant/webhooks/:id – delete webhook
   * GET  /api/merchant/webhooks/:id/logs – delivery logs
   */
  async listWebhooks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const webhooks = await prisma.webhook.findMany({
        where: { merchantId: merchant.id },
        include: {
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, event: true, status: true, attempts: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, data: { webhooks } });
    } catch (err) {
      next(err);
    }
  }

  async createWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { url, events } = req.body;
      if (!url) return next(new AppError('Webhook URL is required', 400));
      if (!events || !Array.isArray(events) || events.length === 0) {
        return next(new AppError('At least one event subscription is required', 400));
      }

      // Validate URL format
      try { new URL(url); } catch { return next(new AppError('Invalid webhook URL', 400)); }

      const secret = crypto.randomBytes(32).toString('hex');

      const webhook = await prisma.webhook.create({
        data: { merchantId: merchant.id, url: url.trim(), events, secret, active: true },
      });

      res.status(201).json({
        success: true,
        data: {
          webhook,
          secret, // Return once – used to verify payloads
          warning: 'Store this secret securely. It will not be shown again.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { id } = req.params;
      const existing = await prisma.webhook.findFirst({ where: { id, merchantId: merchant.id } });
      if (!existing) return next(new AppError('Webhook not found', 404));

      const { url, events, active } = req.body;
      if (url) { try { new URL(url); } catch { return next(new AppError('Invalid webhook URL', 400)); } }

      const updated = await prisma.webhook.update({
        where: { id },
        data: {
          ...(url && { url }),
          ...(events && { events }),
          ...(active !== undefined && { active }),
        },
      });

      res.json({ success: true, data: { webhook: updated } });
    } catch (err) {
      next(err);
    }
  }

  async deleteWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { id } = req.params;
      const existing = await prisma.webhook.findFirst({ where: { id, merchantId: merchant.id } });
      if (!existing) return next(new AppError('Webhook not found', 404));

      await prisma.webhook.delete({ where: { id } });
      res.json({ success: true, message: 'Webhook deleted' });
    } catch (err) {
      next(err);
    }
  }

  async getWebhookLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { id } = req.params;
      const { page = '1' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const take = 25;

      const webhook = await prisma.webhook.findFirst({ where: { id, merchantId: merchant.id } });
      if (!webhook) return next(new AppError('Webhook not found', 404));

      const [logs, total] = await Promise.all([
        prisma.webhookDelivery.findMany({
          where: { webhookId: id },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * take,
          take,
        }),
        prisma.webhookDelivery.count({ where: { webhookId: id } }),
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: { total, page: pageNum, perPage: take, totalPages: Math.ceil(total / take) },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Checkout Settings ──────────────────────────────────────────────────────

  /**
   * GET /api/merchant/settings/checkout
   * PUT /api/merchant/settings/checkout
   */
  async getCheckoutSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const settings = await prisma.merchantSettings.findUnique({
        where: { merchantId: merchant.id },
      });

      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  }

  async updateCheckoutSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { checkoutBranding, paymentMethods, successUrl, cancelUrl } = req.body;

      // Validate custom domain in successUrl / cancelUrl
      const allowedDomains = process.env.ALLOWED_REDIRECT_DOMAINS?.split(',') ?? [];
      const validateUrl = (url: string | undefined) => {
        if (!url) return true;
        try {
          const parsed = new URL(url);
          if (allowedDomains.length === 0) return true;
          return allowedDomains.some((d) => parsed.hostname.endsWith(d.trim()));
        } catch {
          return false;
        }
      };

      if (!validateUrl(successUrl)) return next(new AppError('Invalid or disallowed successUrl domain', 400));
      if (!validateUrl(cancelUrl)) return next(new AppError('Invalid or disallowed cancelUrl domain', 400));

      const settings = await prisma.merchantSettings.upsert({
        where: { merchantId: merchant.id },
        create: {
          merchantId: merchant.id,
          checkoutBranding,
          paymentMethods,
          successUrl: normalizeUrlValue(successUrl),
          cancelUrl: normalizeUrlValue(cancelUrl),
        },
        update: {
          ...(checkoutBranding !== undefined && { checkoutBranding }),
          ...(paymentMethods !== undefined && { paymentMethods }),
          ...(successUrl !== undefined && { successUrl: normalizeUrlValue(successUrl) }),
          ...(cancelUrl !== undefined && { cancelUrl: normalizeUrlValue(cancelUrl) }),
        },
      });

      // Bust dashboard cache
      cache.del(`merchant-dashboard-${merchant.id}`);

      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  }

  // ─── Team Members ───────────────────────────────────────────────────────────

  /**
   * GET  /api/merchant/team          – list members + pending invitations
   * POST /api/merchant/team/invite   – invite team member
   * PUT  /api/merchant/team/:userId/role – update role
   * DELETE /api/merchant/team/:userId – remove member
   */
  async getTeamMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      // Team is modelled through ActivityLog invitations and a metadata convention.
      // In this schema team invitations are tracked as ActivityLog entries with
      // action = 'TEAM_INVITE' and entity = 'merchant' + entityId = merchant.id.
      const invitations = await prisma.activityLog.findMany({
        where: { action: 'TEAM_INVITE', entity: 'merchant', entityId: merchant.id },
        orderBy: { createdAt: 'desc' },
      });

      type TeamInvitationView = {
        id: string;
        invitedAt: Date;
        status?: string;
      } & Record<string, any>;

      const invitationData: TeamInvitationView[] = invitations.map((invitation: (typeof invitations)[number]) => ({
        id: invitation.id,
        invitedAt: invitation.createdAt,
        ...(invitation.newValue as Record<string, any>),
      }));

      const pending = invitationData.filter((invitation: (typeof invitationData)[number]) => invitation.status === 'pending');
      const accepted = invitationData.filter((invitation: (typeof invitationData)[number]) => invitation.status === 'accepted');

      res.json({
        success: true,
        data: {
          members: accepted,
          pendingInvitations: pending,
          summary: {
            memberCount: accepted.length,
            pendingInvitationCount: pending.length,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async inviteTeamMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await getMerchant(req, next);
      if (!merchant) return;

      const { email, role, eventPermissions } = req.body;
      if (!email) return next(new AppError('Email is required', 400));
      if (!role) return next(new AppError('Role is required', 400));

      const validRoles = ['admin', 'manager', 'viewer', 'support'];
      if (!validRoles.includes(role)) {
        return next(new AppError(`Role must be one of: ${validRoles.join(', ')}`, 400));
      }

      const existingPendingInvites = await prisma.activityLog.findMany({
        where: { action: 'TEAM_INVITE', entity: 'merchant', entityId: merchant.id },
        orderBy: { createdAt: 'desc' },
      });
      const hasPendingInvite = existingPendingInvites.some((invite: (typeof existingPendingInvites)[number]) => {
        const inviteMeta = invite.newValue as Record<string, any> | undefined;
        return (
          inviteMeta?.status === 'pending' &&
          inviteMeta.email?.toLowerCase?.() === email.toLowerCase()
        );
      });
      if (hasPendingInvite) {
        return next(new AppError('A pending invitation already exists for this email', 409));
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Record invitation in activity log
      await prisma.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'TEAM_INVITE',
          entity: 'merchant',
          entityId: merchant.id,
          newValue: {
            email,
            role,
            eventPermissions: eventPermissions ?? [],
            token,
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
            invitedBy: req.user!.id,
          },
        },
      });

      // Notify invitee via notification system (email handled by email util in production)
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://pay.rapidtie.com';
      const inviteLink = `${frontendUrl}/team/accept-invite?token=${token}`;

      // In production, call sendVerificationEmail or a dedicated invite email here
      // For now store as a notification for the inviting user
      await prisma.notification.create({
        data: {
          userId: req.user!.id,
          type: 'TEAM_INVITE_SENT',
          title: 'Team Invitation Sent',
          message: `Invitation sent to ${email} for role "${role}". Link: ${inviteLink}`,
          data: { email, role, inviteLink, expiresAt },
        },
      });

      res.status(201).json({
        success: true,
        data: { message: `Invitation sent to ${email}`, inviteLink, expiresAt },
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new MerchantController();