// services/payment.service.ts
import { prisma } from '../server';
import { v4 as uuidv4 } from 'uuid';
import { resolveProvider } from '../integrations/payments/providerRegistry';

export interface PaymentInitiateData {
  sessionToken: string;
  paymentMethod: string;
  provider?: string;
  customerPhone?: string;
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

    try {
      const amount = paymentSession.totalAmount;
      const paymentResult = await providerImpl.initiate({
        amount,
        currency: paymentSession.currency,
        transactionRef,
        customerPhone,
        metadata: { sessionToken },
      });

      if (paymentResult.success) {
        const transaction = await prisma.transaction.create({
          data: {
            transactionRef,
            amount: paymentSession.totalAmount,
            fee: paymentSession.totalAmount * 0.03,
            netAmount: paymentSession.totalAmount * 0.97,
            currency: paymentSession.currency,
            status: 'success',
            paymentMethod,
            provider: providerImpl.id,
            providerRef: paymentResult.providerRef,
            organizerId: paymentSession.event.organizerId,
            metadata: {
              sessionToken,
              eventId: paymentSession.eventId,
              tierId: paymentSession.tierId,
              quantity: paymentSession.quantity
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

        await this.removeInventoryLock(sessionToken);
          await this.handleWebhook({
        transactionRef,
        status: 'success',
        providerRef: paymentResult.providerRef,
        amount: paymentSession.totalAmount,
        metadata: { source: 'initiate_payment' }
      });
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
          status: 'failed',
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
    await this.handleWebhook({
      transactionRef,
      status: 'failed',
      providerRef: '',
      amount: paymentSession.totalAmount,
      metadata: { source: 'initiate_payment', error: errorMessage }
    });
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
  // Release the locked inventory - decrement sold count
  if (paymentSession.orderId) {
    // Get the order to know which tier and quantity
    const order = await prisma.ticketSale.findUnique({
      where: { id: paymentSession.orderId },
      include: { tickets: true }
    });
    
     if (order && order.tickets.length > 0) {
      // Decrement the sold count
      await prisma.ticketTier.update({
        where: { id: paymentSession.tierId },
        data: { sold: { decrement: order.tickets.length } }
      });
      
      // Delete or mark tickets as cancelled
      await prisma.ticket.updateMany({
        where: { orderId: order.id },
        data: { status: 'CANCELLED' }
      });
      
      // Update order status
      await prisma.ticketSale.update({
        where: { id: order.id },
        data: { status: 'failed' }
      });
    }
  }
  
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

  private async removeInventoryLock(sessionToken: string) {
    console.log(`Removed lock for session: ${sessionToken}`);
  }

  async handleWebhook(webhookData: WebhookData) {
    // Fixed: Removed unused 'amount' variable
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

    if (status === 'success' && transaction.status !== 'success') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'success',
          providerRef,
          metadata: { ...(transaction.metadata as any || {}), webhook: metadata }
        }
      });

      if (transaction.orderId) {
        await prisma.ticketSale.update({
          where: { id: transaction.orderId },
          data: { status: 'completed' }
        });
      }

      const paymentSession = await prisma.paymentSession.findFirst({
        where: {
          orderId: transaction.orderId || undefined
        }
      });

      if (paymentSession && paymentSession.status === 'PROCESSING') {
        await prisma.paymentSession.update({
          where: { id: paymentSession.id },
          data: {
            status: 'COMPLETED',
            paymentRef: providerRef
          }
        });
      }
    } else if (status === 'failed' && transaction.status !== 'failed') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          metadata: { ...(transaction.metadata as any || {}), webhookError: metadata }
        }
      });

      const paymentSession = await prisma.paymentSession.findFirst({
        where: {
          orderId: transaction.orderId || undefined
        }
      });

      if (paymentSession) {
        await this.releaseInventory(paymentSession);
      }
    }

    return { success: true, transaction };
  }
}

export const paymentService = new PaymentService();