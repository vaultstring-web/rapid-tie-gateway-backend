"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRCodeService = void 0;
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const server_1 = require("../server");
const QR_SECRET = process.env.QR_SECRET || 'your-super-secret-qr-key';
class QRCodeService {
    static generateSignature(data) {
        return crypto_1.default
            .createHmac('sha256', QR_SECRET)
            .update(data)
            .digest('hex');
    }
    static verifySignature(data, signature) {
        const expectedSignature = this.generateSignature(data);
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }
    static async generateSignedQRCode(ticketId, role) {
        const payload = JSON.stringify({
            ticketId,
            role: role || 'PUBLIC',
            timestamp: Date.now(),
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });
        const signature = this.generateSignature(payload);
        const qrData = `${payload}|${signature}`;
        const qrImage = await qrcode_1.default.toDataURL(qrData, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
        });
        return { qrCode: qrData, signature, qrImage };
    }
    static async generateRoleSpecificQRCode(ticketId, role, permissions) {
        const payload = JSON.stringify({
            ticketId,
            role,
            permissions,
            timestamp: Date.now(),
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });
        const signature = this.generateSignature(payload);
        const qrData = `${payload}|${signature}`;
        const qrImage = await qrcode_1.default.toDataURL(qrData, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
        });
        return { qrCode: qrData, signature, qrImage };
    }
    static decodeAndVerify(qrData) {
        try {
            const lastPipeIndex = qrData.lastIndexOf('|');
            if (lastPipeIndex === -1) {
                return { isValid: false };
            }
            const payload = qrData.substring(0, lastPipeIndex);
            const signature = qrData.substring(lastPipeIndex + 1);
            const isValid = this.verifySignature(payload, signature);
            if (!isValid) {
                return { isValid: false };
            }
            const data = JSON.parse(payload);
            return { isValid: true, data, role: data.role };
        }
        catch (error) {
            return { isValid: false };
        }
    }
    static async regenerateQRCode(ticketId, role) {
        const ticket = await server_1.prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: true, tier: true, order: true },
        });
        if (!ticket) {
            throw new Error('Ticket not found');
        }
        const { qrCode, signature, qrImage } = await this.generateSignedQRCode(ticketId, role);
        await server_1.prisma.ticket.update({
            where: { id: ticketId },
            data: {
                qrCode,
                qrCodeData: JSON.stringify({ qrImage, signature, role: role || 'PUBLIC' }),
            },
        });
        return {
            ticketId,
            qrCode,
            signature,
            qrImage,
            attendeeName: ticket.attendeeName,
            eventName: ticket.event.name,
            tierName: ticket.tier.name,
        };
    }
    static async regenerateEventQRCodes(eventId, role) {
        const tickets = await server_1.prisma.ticket.findMany({
            where: { eventId },
            include: { event: true, tier: true, order: true },
        });
        const regenerated = [];
        for (const ticket of tickets) {
            const result = await this.regenerateQRCode(ticket.id, role);
            regenerated.push(result);
        }
        return { total: tickets.length, tickets: regenerated };
    }
}
exports.QRCodeService = QRCodeService;
exports.default = QRCodeService;
//# sourceMappingURL=qrcode.service.js.map