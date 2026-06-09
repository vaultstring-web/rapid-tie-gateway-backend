// controllers/payment.controller.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { paymentService } from '../services/payment.service';
import { prisma } from '../server';

export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sessionToken, paymentMethod, provider, customerPhone } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    if (!sessionToken || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionToken, paymentMethod'
      });
      return;
    }

    // Verify payment session exists and belongs to user
    const paymentSession = await prisma.paymentSession.findUnique({
      where: { sessionToken }
    });

    if (!paymentSession) {
      res.status(404).json({
        success: false,
        message: 'Payment session not found'
      });
      return;
    }

    // ✅ Ownership check using userId field
    if (paymentSession.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'You can only initiate payments for your own sessions'
      });
      return;
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
    return;
  } catch (error: any) {
    console.error('Payment initiation error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Payment processing failed'
    });
    return;
  }
};

export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;
    const webhookData = req.body;

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

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
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

    // ✅ Ownership check using userId field
    if (paymentSession.userId !== userId) {
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