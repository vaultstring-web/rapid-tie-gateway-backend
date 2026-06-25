// services/payment.service.ts
import { prisma } from '../server';
import { v4 as uuidv4 } from 'uuid';
import { resolveProvider } from '../integrations/payments/providerRegistry';
import { finalizeSale } from './tickets.service';
import { releaseLock } from './inventoryLock.service';

export interface PaymentInitiateData {
  sessionToken: string;
  paymentMethod: string;
  provider?: string;
  customerPhone?: string;
   token?: string;
}

export interface WebhookData {
  transactionRef: string;
  status: 'success' | 'failed' | 'pending';
  providerRef: string;
  amount: number;
  metadata?: Record<string, any>;
}

class PaymentService {
  async initiatePayment(data: PaymentInitiateData) {
    const { sessionToken, paymentMethod, provider, customerPhone } = data;

    const paymentSession = await prisma.paymentSession.findUnique({
      where: { sessionToken },
      include: {
        event: {
          include: { organizer: true }
        },
        tier: true
      }
    });

    if (!paymentSession) {
      throw new Error('Payment session not found or expired');
    }

    if (paymentSession.status !== 'PENDING') {
      throw new Error(`Payment session is already ${paymentSession.status}`);
    }

    if (paymentSession.expiresAt < new Date()) {
      await this.releaseInventory(paymentSession);
      throw new Error('Payment session has expired');
    }

    await prisma.paymentSession.update({
      where: { id: paymentSession.id },
      data: {
        status: 'PROCESSING',
        paymentMethod,
        updatedAt: new Date()
      }
    });

    const transactionRef = `TXN-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const providerImpl = resolveProvider({ paymentMethod, provider });

    const merchant = await prisma.merchant.findUnique({
      where: { userId: paymentSession.event.organizer.userId },
      select: { feePercentage: true }
    });
    const feePercentage = merchant?.feePercentage ?? 3.0;
    const feeRate = feePercentage / 100;

    try {
      const amount = paymentSession.totalAmount;
      const paymentResult = await providerImpl.initiate({
        amount,
        currency: paymentSession.currency,
        transactionRef,
        customerPhone,
        token: data.token,
        metadata: { sessionToken },
      });

      if (paymentResult.success) {
        const transaction = await prisma.transaction.create({
          data: {
            transactionRef,
            amount: paymentSession.totalAmount,
            fee: paymentSession.totalAmount * feeRate,
            netAmount: paymentSession.totalAmount * (1 - feeRate),
            currency: paymentSession.currency,
            status: 'SUCCESS',
            paymentMethod,
            provider: providerImpl.id,
            providerRef: paymentResult.providerRef,
            organizerId: paymentSession.event.organizerId,
            metadata: {
              sessionToken,
              eventId: paymentSession.eventId,
              tierId: paymentSession.tierId,
              quantity: paymentSession.quantity,
              appliedFeePercentage: feePercentage
            }
            
          }
        });
          
        let order = null;
        if (paymentSession.orderId) {
          order = await prisma.ticketSale.findUnique({
            where: { id: paymentSession.orderId }
          });
        }

        await prisma.paymentSession.update({
          where: { id: paymentSession.id },
          data: {
            status: 'COMPLETED',
            paymentRef: paymentResult.providerRef,
            paymentMethod: paymentMethod,
            updatedAt: new Date()
          }
        });

        if (transaction.id) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { orderId: paymentSession.orderId }
          });
        }

        await releaseLock(sessionToken);

        // Finalize the sale (create tickets, increment sold count) directly
        // instead of routing through handleWebhook to avoid double-update race
        // conditions with external provider callbacks.
        await finalizeSale(sessionToken);
        return {
          success: true,
          transaction,
          order,
          paymentSession
        };
      } else {
        throw new Error('Payment processing failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await this.releaseInventory(paymentSession);

      await prisma.transaction.create({
        data: {
          transactionRef,
          amount: paymentSession.totalAmount,
          fee: 0,
          netAmount: 0,
          currency: paymentSession.currency,
          status: 'FAILED',
          paymentMethod,
          provider: providerImpl.id,
          organizerId: paymentSession.event.organizerId,
          metadata: {
            error: errorMessage,
            sessionToken,
            eventId: paymentSession.eventId
          }
        }
      });

      await prisma.paymentSession.update({
        where: { id: paymentSession.id },
        data: {
          status: 'FAILED',
          updatedAt: new Date(),
          metadata: { error: errorMessage }
        }
      });
    // Do NOT call handleWebhook here — the failure is already recorded above.
    // External provider webhooks will be handled separately via handleWebhook.
      throw new Error(errorMessage);
    }
  }

  async createPaymentSession(
    eventId: string,
    tierId: string,
    quantity: number,
    totalAmount: number,
    sessionToken: string,
    orderId?: string
  ) {
    const paymentSession = await prisma.paymentSession.create({
      data: {
        sessionToken,
        eventId,
        tierId,
        quantity,
        totalAmount,
        currency: 'MWK',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        orderId: orderId,
        metadata: {
          createdAt: new Date().toISOString(),
          sessionToken,
          orderCreated: !!orderId
        }
      }
    });

    return paymentSession;
  }

  private async releaseInventory(paymentSession: any) {
    // Update order status to CANCELLED
    if (paymentSession.orderId) {
      await prisma.ticketSale.update({
        where: { id: paymentSession.orderId },
        data: { status: 'CANCELLED' }
      });
    }
    
    // Release the lock
    await releaseLock(paymentSession.sessionToken);
  
    await prisma.paymentSession.update({
      where: { id: paymentSession.id },
      data: {
        status: 'FAILED',
        updatedAt: new Date(),
        metadata: { released: true, releasedAt: new Date().toISOString() }
      }
    });
    
    console.log(`Inventory released for session: ${paymentSession.sessionToken}`);
}

  async handleWebhook(webhookData: WebhookData) {
    const { transactionRef, status, providerRef, metadata } = webhookData;

    const transaction = await prisma.transaction.findUnique({
      where: { transactionRef },
      include: {
        organizer: true
      }
    });

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionRef}`);
    }

    if (status === 'success' && transaction.status !== 'SUCCESS') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          providerRef,
          metadata: { ...(transaction.metadata as any || {}), webhook: metadata }
        }
      });

      // Get payment session using sessionToken from metadata if available
      let paymentSession = null;
      const sessionToken = (metadata as any)?.sessionToken;
      
      if (sessionToken) {
        paymentSession = await prisma.paymentSession.findUnique({
          where: { sessionToken }
        });
      } else if (transaction.orderId) {
        paymentSession = await prisma.paymentSession.findFirst({
          where: { orderId: transaction.orderId }
        });
      }

      if (paymentSession && paymentSession.status !== 'COMPLETED') {
        // Finalize the sale (create tickets, increment sold count)
        await finalizeSale(paymentSession.sessionToken);
      }

      if (paymentSession && paymentSession.status === 'PROCESSING') {
        await prisma.paymentSession.update({
          where: { id: paymentSession.id },
          data: {
            status: 'COMPLETED',
            paymentRef: providerRef
          }
        });
      }
    } else if (status === 'failed' && transaction.status !== 'FAILED') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          metadata: { ...(transaction.metadata as any || {}), webhookError: metadata }
        }
      });

      let paymentSession = null;
      const sessionToken = (metadata as any)?.sessionToken;
      
      if (sessionToken) {
        paymentSession = await prisma.paymentSession.findUnique({
          where: { sessionToken }
        });
      } else if (transaction.orderId) {
        paymentSession = await prisma.paymentSession.findFirst({
          where: { orderId: transaction.orderId }
        });
      }

      if (paymentSession) {
        await this.releaseInventory(paymentSession);
      }
    }

    return { success: true, transaction };
  }
}

export const paymentService = new PaymentService();