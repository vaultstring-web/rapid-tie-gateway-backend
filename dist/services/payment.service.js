"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = void 0;
const server_1 = require("../server");
const uuid_1 = require("uuid");
class PaymentService {
    async processAirtelMoney(phone, amount, reference) {
        console.log(`Processing Airtel Money: ${phone}, ${amount}, ${reference}`);
        if (phone === "0000000000") {
            console.log('Test failure triggered');
            throw new Error('Payment failed - test mode');
        }
        return { success: true, providerRef: `AIR-${Date.now()}` };
    }
    async processMpamba(phone, amount, reference) {
        console.log(`Processing Mpamba: ${phone}, ${amount}, ${reference}`);
        return { success: true, providerRef: `MP-${Date.now()}` };
    }
    async processCard(_cardDetails, amount, reference) {
        console.log(`Processing Card: ${amount}, ${reference}`);
        return { success: true, providerRef: `CARD-${Date.now()}` };
    }
    async initiatePayment(data) {
        const { sessionToken, paymentMethod, provider, customerPhone } = data;
        const paymentSession = await server_1.prisma.paymentSession.findUnique({
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
        await server_1.prisma.paymentSession.update({
            where: { id: paymentSession.id },
            data: {
                status: 'PROCESSING',
                paymentMethod,
                updatedAt: new Date()
            }
        });
        const transactionRef = `TXN-${Date.now()}-${(0, uuid_1.v4)().slice(0, 8)}`;
        try {
            let paymentResult;
            const amount = paymentSession.totalAmount;
            switch (paymentMethod) {
                case 'airtel_money':
                    if (!customerPhone)
                        throw new Error('Phone number required for Airtel Money');
                    paymentResult = await this.processAirtelMoney(customerPhone, amount, transactionRef);
                    break;
                case 'mpamba':
                    if (!customerPhone)
                        throw new Error('Phone number required for Mpamba');
                    paymentResult = await this.processMpamba(customerPhone, amount, transactionRef);
                    break;
                case 'card':
                    paymentResult = await this.processCard({}, amount, transactionRef);
                    break;
                default:
                    throw new Error(`Unsupported payment method: ${paymentMethod}`);
            }
            if (paymentResult.success) {
                const transaction = await server_1.prisma.transaction.create({
                    data: {
                        transactionRef,
                        amount: paymentSession.totalAmount,
                        fee: paymentSession.totalAmount * 0.03,
                        netAmount: paymentSession.totalAmount * 0.97,
                        currency: paymentSession.currency,
                        status: 'success',
                        paymentMethod,
                        provider: provider || paymentMethod,
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
                    order = await server_1.prisma.ticketSale.findUnique({
                        where: { id: paymentSession.orderId }
                    });
                }
                await server_1.prisma.paymentSession.update({
                    where: { id: paymentSession.id },
                    data: {
                        status: 'COMPLETED',
                        paymentRef: paymentResult.providerRef,
                        paymentMethod: paymentMethod,
                        updatedAt: new Date()
                    }
                });
                if (transaction.id) {
                    await server_1.prisma.transaction.update({
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
            }
            else {
                throw new Error('Payment processing failed');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            await this.releaseInventory(paymentSession);
            await server_1.prisma.transaction.create({
                data: {
                    transactionRef,
                    amount: paymentSession.totalAmount,
                    fee: 0,
                    netAmount: 0,
                    currency: paymentSession.currency,
                    status: 'failed',
                    paymentMethod,
                    provider: provider || paymentMethod,
                    organizerId: paymentSession.event.organizerId,
                    metadata: {
                        error: errorMessage,
                        sessionToken,
                        eventId: paymentSession.eventId
                    }
                }
            });
            await server_1.prisma.paymentSession.update({
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
    async createPaymentSession(eventId, tierId, quantity, totalAmount, sessionToken, orderId) {
        const paymentSession = await server_1.prisma.paymentSession.create({
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
    async releaseInventory(paymentSession) {
        if (paymentSession.orderId) {
            const order = await server_1.prisma.ticketSale.findUnique({
                where: { id: paymentSession.orderId },
                include: { tickets: true }
            });
            if (order && order.tickets.length > 0) {
                await server_1.prisma.ticketTier.update({
                    where: { id: paymentSession.tierId },
                    data: { sold: { decrement: order.tickets.length } }
                });
                await server_1.prisma.ticket.updateMany({
                    where: { orderId: order.id },
                    data: { status: 'CANCELLED' }
                });
                await server_1.prisma.ticketSale.update({
                    where: { id: order.id },
                    data: { status: 'failed' }
                });
            }
        }
        await server_1.prisma.paymentSession.update({
            where: { id: paymentSession.id },
            data: {
                status: 'FAILED',
                updatedAt: new Date(),
                metadata: { released: true, releasedAt: new Date().toISOString() }
            }
        });
        console.log(`Inventory released for session: ${paymentSession.sessionToken}`);
    }
    async removeInventoryLock(sessionToken) {
        console.log(`Removed lock for session: ${sessionToken}`);
    }
    async handleWebhook(webhookData) {
        const { transactionRef, status, providerRef, metadata } = webhookData;
        const transaction = await server_1.prisma.transaction.findUnique({
            where: { transactionRef },
            include: {
                organizer: true
            }
        });
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionRef}`);
        }
        if (status === 'success' && transaction.status !== 'success') {
            await server_1.prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'success',
                    providerRef,
                    metadata: { ...(transaction.metadata || {}), webhook: metadata }
                }
            });
            if (transaction.orderId) {
                await server_1.prisma.ticketSale.update({
                    where: { id: transaction.orderId },
                    data: { status: 'completed' }
                });
            }
            const paymentSession = await server_1.prisma.paymentSession.findFirst({
                where: {
                    orderId: transaction.orderId || undefined
                }
            });
            if (paymentSession && paymentSession.status === 'PROCESSING') {
                await server_1.prisma.paymentSession.update({
                    where: { id: paymentSession.id },
                    data: {
                        status: 'COMPLETED',
                        paymentRef: providerRef
                    }
                });
            }
        }
        else if (status === 'failed' && transaction.status !== 'failed') {
            await server_1.prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'failed',
                    metadata: { ...(transaction.metadata || {}), webhookError: metadata }
                }
            });
            const paymentSession = await server_1.prisma.paymentSession.findFirst({
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
exports.paymentService = new PaymentService();
//# sourceMappingURL=payment.service.js.map