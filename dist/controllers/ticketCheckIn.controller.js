"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCheckInStats = exports.batchCheckIn = exports.checkInTicket = exports.generateSignedQRCode = void 0;
const server_1 = require("../server");
const crypto_1 = __importDefault(require("crypto"));
const QR_SECRET = process.env.QR_SECRET || 'your-qr-secret-key-change-in-production';
const verifyQRCode = (qrCode, signature) => {
    if (!signature)
        return false;
    const expectedSignature = crypto_1.default
        .createHmac('sha256', QR_SECRET)
        .update(qrCode)
        .digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};
const generateSignedQRCode = (ticketId) => {
    const qrCode = ticketId;
    const signature = crypto_1.default
        .createHmac('sha256', QR_SECRET)
        .update(qrCode)
        .digest('hex');
    return { qrCode, signature };
};
exports.generateSignedQRCode = generateSignedQRCode;
const checkInTicket = async (req, res) => {
    try {
        const { qrCode, signature, role, deviceId } = req.body;
        if (!qrCode) {
            res.status(400).json({ success: false, message: "QR code is required" });
            return;
        }
        if (signature && !verifyQRCode(qrCode, signature)) {
            res.status(401).json({
                success: false,
                message: "Invalid QR code signature"
            });
            return;
        }
        const ticket = await server_1.prisma.ticket.findUnique({
            where: { qrCode },
            include: {
                order: true,
                event: true,
                tier: true
            },
        });
        if (!ticket) {
            res.status(404).json({ success: false, message: "Ticket not found" });
            return;
        }
        if (ticket.checkedInAt) {
            res.status(400).json({
                success: false,
                message: "Ticket already checked in",
                data: {
                    checkedInAt: ticket.checkedInAt,
                    checkedInBy: ticket.checkedInBy
                }
            });
            return;
        }
        if (ticket.event.endDate < new Date()) {
            res.status(400).json({
                success: false,
                message: "Event has already ended"
            });
            return;
        }
        const updatedTicket = await server_1.prisma.ticket.update({
            where: { id: ticket.id },
            data: {
                status: "USED",
                checkedInAt: new Date(),
                checkedInBy: role || req.user?.role || "ORGANIZER",
            },
        });
        await server_1.prisma.auditLog.create({
            data: {
                action: 'TICKET_CHECKIN',
                status: 'success',
                details: {
                    ticketId: ticket.id,
                    eventId: ticket.eventId,
                    tierId: ticket.tierId,
                    role: role || 'ORGANIZER',
                    deviceId: deviceId || 'unknown',
                    timestamp: new Date().toISOString()
                },
                userId: req.user?.id || null
            }
        });
        res.status(200).json({
            success: true,
            message: "Ticket successfully checked in",
            data: {
                ticketId: updatedTicket.id.slice(-8),
                attendeeName: updatedTicket.attendeeName,
                ticketType: ticket.tier?.name,
                eventName: ticket.event.name,
                checkedInAt: updatedTicket.checkedInAt,
                status: updatedTicket.status,
                deviceUsed: deviceId || 'unknown'
            }
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.checkInTicket = checkInTicket;
const batchCheckIn = async (req, res) => {
    try {
        const { tickets, role, deviceId } = req.body;
        if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
            res.status(400).json({
                success: false,
                message: "Tickets array is required"
            });
            return;
        }
        const results = [];
        const errors = [];
        for (const ticketData of tickets) {
            try {
                const { qrCode, signature } = ticketData;
                const ticket = await server_1.prisma.ticket.findUnique({
                    where: { qrCode },
                    include: { event: true }
                });
                if (!ticket) {
                    errors.push({ qrCode, error: 'Ticket not found' });
                    continue;
                }
                if (ticket.checkedInAt) {
                    errors.push({ qrCode, error: 'Already checked in' });
                    continue;
                }
                if (signature && !verifyQRCode(qrCode, signature)) {
                    errors.push({ qrCode, error: 'Invalid signature' });
                    continue;
                }
                const updatedTicket = await server_1.prisma.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        status: "USED",
                        checkedInAt: new Date(),
                        checkedInBy: role || "BATCH_SCANNER",
                    }
                });
                await server_1.prisma.auditLog.create({
                    data: {
                        action: 'BATCH_CHECKIN',
                        status: 'success',
                        details: {
                            ticketId: ticket.id,
                            eventId: ticket.eventId,
                            role: role || 'BATCH_SCANNER',
                            deviceId: deviceId || 'unknown',
                            batchCount: tickets.length
                        }
                    }
                });
                results.push({
                    ticketId: updatedTicket.id.slice(-8),
                    attendeeName: updatedTicket.attendeeName,
                    status: 'success'
                });
            }
            catch (error) {
                errors.push({ qrCode: ticketData.qrCode, error: 'Processing failed' });
            }
        }
        res.status(200).json({
            success: true,
            data: {
                total: tickets.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors: errors.slice(0, 10),
                deviceUsed: deviceId || 'unknown'
            }
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.batchCheckIn = batchCheckIn;
const getCheckInStats = async (req, res) => {
    try {
        const { eventId } = req.params;
        const stats = await server_1.prisma.ticket.groupBy({
            by: ['status'],
            where: { eventId: eventId },
            _count: true
        });
        const checkInsByRole = await server_1.prisma.ticket.groupBy({
            by: ['checkedInBy'],
            where: {
                eventId: eventId,
                status: 'USED'
            },
            _count: true
        });
        const totalTickets = await server_1.prisma.ticket.count({
            where: { eventId: eventId }
        });
        const checkedIn = stats.find(s => s.status === 'USED')?._count || 0;
        const pending = stats.find(s => s.status === 'ACTIVE')?._count || 0;
        res.status(200).json({
            success: true,
            data: {
                total: totalTickets,
                checkedIn,
                pending,
                checkInRate: totalTickets > 0 ? ((checkedIn / totalTickets) * 100).toFixed(1) : 0,
                checkInsByRole: checkInsByRole.map(role => ({
                    role: role.checkedInBy || 'unknown',
                    count: role._count
                }))
            }
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.getCheckInStats = getCheckInStats;
//# sourceMappingURL=ticketCheckIn.controller.js.map