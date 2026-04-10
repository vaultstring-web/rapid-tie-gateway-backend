// controllers/payment.controller.ts
import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { prisma } from '../server';

export const initiatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, paymentMethod, provider, customerPhone } = req.body;

    if (!sessionToken || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionToken, paymentMethod'
      });
      return; // Added return
    }

    const result = await paymentService.initiatePayment({
      sessionToken,
      paymentMethod,
      provider,
      customerPhone
    });

    res.status(200).json({
      success: true,
      data: result
    });
    return; // Added return
  } catch (error: any) {
    console.error('Payment initiation error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Payment processing failed'
    });
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