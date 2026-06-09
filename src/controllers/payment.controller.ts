// controllers/payment.controller.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { paymentService } from '../services/payment.service';
import { prisma } from '../server';
import { beginIdempotency, completeIdempotency, hashRequestBody } from '../services/idempotency.service';

export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const idempotencyKey = req.header('Idempotency-Key') || req.header('Idempotency-key');
  const requestHash = idempotencyKey ? hashRequestBody(req.body) : '';
  let idemKey: string | null = null;

  try {
    const { sessionToken, paymentMethod, provider, customerPhone } = req.body;
    const userId = req.user?.id;

    // ✅ Authentication check
    if (!userId) {
      const body = {
        success: false,
        message: 'Authentication required'
      };
      res.status(401).json(body);
      return;
    }

    if (!sessionToken || !paymentMethod) {
      const body = {
        success: false,
        message: 'Missing required fields: sessionToken, paymentMethod'
      };
      res.status(400).json(body);
      return;
    }

    // ✅ Verify payment session exists and belongs to user
    const paymentSession = await prisma.paymentSession.findUnique({
      where: { sessionToken }
    });

    if (!paymentSession) {
      const body = {
        success: false,
        message: 'Payment session not found'
      };
      res.status(404).json(body);
      return;
    }

    // ✅ Ownership check
    if (paymentSession.userId && paymentSession.userId !== userId) {
      const body = {
        success: false,
        message: 'You can only initiate payments for your own sessions'
      };
      res.status(403).json(body);
      return;
    }

    if (idempotencyKey) {
      const idem = await beginIdempotency({
        namespace: 'payments:initiate',
        idempotencyKey,
        requestHash,
        ttlSeconds: 60 * 30,
      });

      if (idem.type === 'replay') {
        res.setHeader('Idempotency-Replayed', 'true');
        res.status(idem.httpStatus).json(idem.body);
        return;
      }
      if (idem.type === 'busy') {
        res.setHeader('Retry-After', '1');
        res.status(409).json({ success: false, message: idem.message });
        return;
      }
      if (idem.type === 'conflict') {
        res.status(409).json({ success: false, message: idem.message });
        return;
      }

      idemKey = idem.key;
    }

    const result = await paymentService.initiatePayment({
      sessionToken,
      paymentMethod,
      provider,
      customerPhone
    });

    const body = {
      success: true,
      data: result
    };
    res.status(200).json(body);

    if (idemKey) {
      await completeIdempotency({
        key: idemKey,
        requestHash,
        httpStatus: 200,
        body,
        ttlSeconds: 60 * 30,
      });
    }
    return;
  } catch (error: any) {
    console.error('Payment initiation error:', error);
    const body = {
      success: false,
      message: error.message || 'Payment processing failed'
    };
    res.status(400).json(body);

    if (idemKey) {
      await completeIdempotency({
        key: idemKey,
        requestHash,
        httpStatus: 400,
        body,
        ttlSeconds: 60 * 10,
      });
    }
    return;
  }
};

export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;
    const webhookData = req.body;

    // Verify webhook signature here based on provider
    // This is critical for security

    const transactionRef = webhookData.transactionRef || webhookData.reference;
    const status = webhookData.status === 'success' ? 'success' : 'failed';
    const providerRef = webhookData.providerRef || webhookData.transactionId;
    const amount = webhookData.amount;

    const result = await paymentService.handleWebhook({
      transactionRef,
      status,
      providerRef,
      amount,
      metadata: { provider, rawData: webhookData }
    });

    res.status(200).json({ success: true, data: result });
    return;
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
    return;
  }
};

export const getPaymentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.params;
    const userId = req.user?.id;

    // ✅ Authentication check
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        message: 'Session token is required'
      });
      return;
    }

    const paymentSession = await prisma.paymentSession.findUnique({
      where: { sessionToken },
      include: {
        event: {
          select: {
            name: true,
            organizer: {
              select: {
                organizationName: true
              }
            }
          }
        },
        tier: {
          select: {
            name: true,
            price: true
          }
        }
      }
    });

    if (!paymentSession) {
      res.status(404).json({
        success: false,
        message: 'Payment session not found'
      });
      return;
    }

    // ✅ Ownership check
    if (paymentSession.userId && paymentSession.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'You can only view your own payment sessions'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        status: paymentSession.status,
        amount: paymentSession.totalAmount,
        currency: paymentSession.currency,
        expiresAt: paymentSession.expiresAt,
        paymentMethod: paymentSession.paymentMethod,
        event: paymentSession.event,
        tier: paymentSession.tier,
        quantity: paymentSession.quantity
      }
    });
    return;
  } catch (error: any) {
    console.error('Get payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get payment status' 
    });
    return;
  }
};