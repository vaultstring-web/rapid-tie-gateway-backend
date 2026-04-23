"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentStatus = exports.handlePaymentWebhook = exports.initiatePayment = void 0;
const payment_service_1 = require("../services/payment.service");
const server_1 = require("../server");
const initiatePayment = async (req, res) => {
    try {
        const { sessionToken, paymentMethod, provider, customerPhone } = req.body;
        if (!sessionToken || !paymentMethod) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: sessionToken, paymentMethod'
            });
            return;
        }
        const result = await payment_service_1.paymentService.initiatePayment({
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
    }
    catch (error) {
        console.error('Payment initiation error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Payment processing failed'
        });
        return;
    }
};
exports.initiatePayment = initiatePayment;
const handlePaymentWebhook = async (req, res) => {
    try {
        const { provider } = req.params;
        const webhookData = req.body;
        const transactionRef = webhookData.transactionRef || webhookData.reference;
        const status = webhookData.status === 'success' ? 'success' : 'failed';
        const providerRef = webhookData.providerRef || webhookData.transactionId;
        const amount = webhookData.amount;
        const result = await payment_service_1.paymentService.handleWebhook({
            transactionRef,
            status,
            providerRef,
            amount,
            metadata: { provider, rawData: webhookData }
        });
        res.status(200).json({ success: true, data: result });
        return;
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: error.message });
        return;
    }
};
exports.handlePaymentWebhook = handlePaymentWebhook;
const getPaymentStatus = async (req, res) => {
    try {
        const { sessionToken } = req.params;
        if (!sessionToken) {
            res.status(400).json({
                success: false,
                message: 'Session token is required'
            });
            return;
        }
        const paymentSession = await server_1.prisma.paymentSession.findUnique({
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
    }
    catch (error) {
        console.error('Get payment status error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get payment status'
        });
        return;
    }
};
exports.getPaymentStatus = getPaymentStatus;
//# sourceMappingURL=payment.controller.js.map