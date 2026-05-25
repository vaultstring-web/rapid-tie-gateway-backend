// controllers/payment.controller.ts
import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { prisma } from '../server';
import { beginIdempotency, completeIdempotency, hashRequestBody } from '../services/idempotency.service';

export const initiatePayment = async (req: Request, res: Response): Promise<void> => {
  const idempotencyKey = req.header('Idempotency-Key') || req.header('Idempotency-key');
  const requestHash = idempotencyKey ? hashRequestBody(req.body) : '';
  let idemKey: string | null = null;

  try {
    const { sessionToken, paymentMethod, provider, customerPhone } = req.body;

    if (!sessionToken || !paymentMethod) {
      const body = {
        success: false,
        message: 'Missing required fields: sessionToken, paymentMethod'
      };
      res.status(400).json(body);
      return; // Added return
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
    return; // Added return
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
    return; // Added return
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
    return; // Added return
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
    return; // Added return
  }
};

export const getPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.params;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        message: 'Session token is required'
      });
      return; // Added return
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
      return; // Added return
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
    return; // Added return
  } catch (error: any) {
    console.error('Get payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get payment status' 
    });
    return; // Added return
  }
};