"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseTickets = void 0;
const server_1 = require("../server");
const uuid_1 = require("uuid");
const payment_service_1 = require("../services/payment.service");
const inventoryLocks = {};
function lockInventory(sessionToken, tierId, durationMs) {
    inventoryLocks[sessionToken] = { tierId, expiresAt: Date.now() + durationMs };
    return inventoryLocks[sessionToken];
}
setInterval(() => {
    const now = Date.now();
    for (const token in inventoryLocks) {
        if (inventoryLocks[token].expiresAt < now) {
            delete inventoryLocks[token];
        }
    }
}, 60000);
const purchaseTickets = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const { tierId, quantity, customerName, customerEmail, customerPhone } = req.body;
        if (!tierId || !quantity || !customerName || !customerEmail) {
            res.status(400).json({ success: false, message: "Missing required fields" });
            return;
        }
        const user = req.user;
        const purchaserRole = user?.role || "PUBLIC";
        const event = await server_1.prisma.event.findUnique({
            where: { id: eventId },
            include: { ticketTiers: true, organizer: true },
        });
        if (!event) {
            res.status(404).json({ success: false, message: "Event not found" });
            return;
        }
        const tier = event.ticketTiers.find(t => t.id === tierId);
        if (!tier) {
            res.status(404).json({ success: false, message: "Ticket tier not found" });
            return;
        }
        const activeLocks = Object.values(inventoryLocks)
            .filter(lock => lock.tierId === tierId && lock.expiresAt > Date.now()).length;
        if (tier.sold + quantity + activeLocks > tier.quantity) {
            res.status(400).json({ success: false, message: "Not enough tickets available" });
            return;
        }
        const sessionToken = (0, uuid_1.v4)();
        lockInventory(sessionToken, tierId, 15 * 60 * 1000);
        const feePercentage = 0.03;
        const totalAmount = tier.price * quantity;
        const feeAmount = totalAmount * feePercentage;
        const netAmount = totalAmount - feeAmount;
        const sale = await server_1.prisma.ticketSale.create({
            data: {
                organizerId: event.organizerId,
                eventId: event.id,
                orderNumber: `ORD-${Date.now()}`,
                customerName,
                customerEmail,
                customerPhone,
                totalAmount,
                feeAmount,
                netAmount,
                status: "completed",
                paymentMethod: "pending",
            },
        });
        const tickets = await Promise.all(Array.from({ length: quantity }).map(async () => {
            const ticketID = (0, uuid_1.v4)();
            const qr = (0, uuid_1.v4)();
            return await server_1.prisma.ticket.create({
                data: {
                    id: ticketID,
                    eventId: event.id,
                    tierId: tier.id,
                    orderId: sale.id,
                    attendeeName: customerName,
                    attendeeEmail: customerEmail,
                    attendeePhone: customerPhone,
                    qrCode: qr,
                    qrCodeData: JSON.stringify({ ticketId: ticketID, eventId: event.id, tierId: tier.id }),
                },
            });
        }));
        await server_1.prisma.ticketTier.update({
            where: { id: tier.id },
            data: { sold: { increment: quantity } },
        });
        try {
            await payment_service_1.paymentService.createPaymentSession(eventId, tierId, quantity, totalAmount, sessionToken, sale.id);
        }
        catch (paymentSessionError) {
            console.error("Failed to create payment session:", paymentSessionError);
        }
        res.status(201).json({
            success: true,
            data: {
                order: sale,
                tickets,
                sessionToken,
                purchaserRole,
                paymentSession: {
                    token: sessionToken,
                    amount: totalAmount,
                    currency: "MWK",
                    expiresIn: "15 minutes"
                }
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.purchaseTickets = purchaseTickets;
//# sourceMappingURL=ticketPurchases.controller.js.map