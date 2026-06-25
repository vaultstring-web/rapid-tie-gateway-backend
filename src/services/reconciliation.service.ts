// src/services/reconciliation.service.ts
import { prisma } from '../server';
import { logger } from '../utils/logger';

export interface ReconciliationResult {
  matched: number;
  unmatched: number;
  discrepancies: any[];
}

export class ReconciliationService {
  /**
   * Reconcile transactions between internal records and provider statements
   * Uses indexes: providerRef, status, createdAt
   */
  async reconcileTransactions(
    provider: string,
    startDate: Date,
    endDate: Date
  ): Promise<ReconciliationResult> {
    logger.info(`Reconciling transactions for provider ${provider} from ${startDate} to ${endDate}`);

    // Query transactions with providerRef - uses @@index([providerRef])
    const internalTransactions = await prisma.transaction.findMany({
      where: {
        provider,
        createdAt: { gte: startDate, lt: endDate },
        status: 'SUCCESS',
      },
      select: {
        id: true,
        providerRef: true,
        amount: true,
        createdAt: true,
      },
    });

    // Simulate fetching from provider API
    const providerTransactions = await this.fetchProviderTransactions();

    // Match transactions by providerRef
    const matched: string[] = [];
    const discrepancies: any[] = [];

    for (const internal of internalTransactions) {
      const providerMatch = providerTransactions.find(
        (p) => p.providerRef === internal.providerRef
      );

      if (providerMatch) {
        if (Math.abs(internal.amount - providerMatch.amount) > 0.01) {
          discrepancies.push({
            type: 'amount_mismatch',
            internalId: internal.id,
            providerRef: internal.providerRef,
            internalAmount: internal.amount,
            providerAmount: providerMatch.amount,
          });
        }
        if (internal.providerRef) {
          matched.push(internal.providerRef);
        }
      } else {
        discrepancies.push({
          type: 'missing_in_provider',
          internalId: internal.id,
          providerRef: internal.providerRef,
          amount: internal.amount,
        });
      }
    }

    const unmatched = internalTransactions.length - matched.length;

    logger.info(`Reconciliation complete: matched=${matched.length}, unmatched=${unmatched}, discrepancies=${discrepancies.length}`);

    return {
      matched: matched.length,
      unmatched,
      discrepancies,
    };
  }

  /**
   * Get pending settlements - uses @@index([status, createdAt])
   */
  async getPendingSettlements(daysOld: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // This query uses @@index([status, createdAt])
    const pendingSettlements = await prisma.settlement.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoffDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    return pendingSettlements;
  }

  /**
   * Get merchant settlement summary - uses @@index([merchantId, status, createdAt])
   */
  async getMerchantSettlementSummary(merchantId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // This query uses @@index([merchantId, status, createdAt])
    const summary = await prisma.transaction.aggregate({
      where: {
        merchantId,
        status: 'SUCCESS',
        createdAt: { gte: startDate },
      },
      _sum: {
        amount: true,
        fee: true,
        netAmount: true,
      },
      _count: true,
    });

    return summary;
  }

  /**
   * Get organizer settlement summary - uses @@index([organizerId, status, createdAt])
   */
  async getOrganizerSettlementSummary(organizerId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // This query uses @@index([organizerId, status, createdAt])
    const summary = await prisma.transaction.aggregate({
      where: {
        organizerId,
        status: 'SUCCESS',
        createdAt: { gte: startDate },
      },
      _sum: {
        amount: true,
        fee: true,
        netAmount: true,
      },
      _count: true,
    });

    return summary;
  }

  // Simulate fetching from provider API
  private async fetchProviderTransactions() {
    // Mock implementation - replace with actual API call
    return [
      {
        providerRef: 'TXN001',
        amount: 10000,
        date: new Date(),
      },
      {
        providerRef: 'TXN002',
        amount: 25000,
        date: new Date(),
      },
    ];
  }
}

export const reconciliationService = new ReconciliationService();