"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueBulkEmails = exports.getDeliveryStatus = exports.generateRoleSpecificQRCodes = exports.regenerateTicketQRCode = exports.regenerateEventQRCodes = void 0;
const server_1 = require("../server");
const qrcode_service_1 = __importDefault(require("../services/qrcode.service"));
const emailQueue = [];
let isProcessingQueue = false;
async function processEmailQueue() {
    if (isProcessingQueue || emailQueue.length === 0)
        return;
    isProcessingQueue = true;
    while (emailQueue.length > 0) {
        const batch = emailQueue.splice(0, 10);
        for (const item of batch) {
            try {
                await sendTicketEmail(item);
                await updateDeliveryStatus(item.ticketId, 'sent');
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to send email for ticket ${item.ticketId}:`, error);
                await updateDeliveryStatus(item.ticketId, 'failed', errorMessage);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    isProcessingQueue = false;
}
async function sendTicketEmail(item) {
    console.log(`📧 Sending ticket email to ${item.email} for ${item.eventName}`);
    console.log(`   QR Code: ${item.qrImage.substring(0, 100)}...`);
}
async function updateDeliveryStatus(ticketId, status, error) {
    const ticket = await server_1.prisma.ticket.findUnique({
        where: { id: ticketId },
    });
    const currentMetadata = ticket?.metadata || {};
    await server_1.prisma.ticket.update({
        where: { id: ticketId },
        data: {
            metadata: {
                ...currentMetadata,
                emailStatus: status,
                emailSentAt: status === 'sent' ? new Date().toISOString() : currentMetadata.emailSentAt,
                emailError: error,
            },
        },
    });
}
const regenerateEventQRCodes = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const { role = 'PUBLIC', sendEmails = false } = req.body;
        const event = await server_1.prisma.event.findFirst({
            where: {
                id: eventId,
                organizer: { userId: user.id },
            },
        });
        if (!event) {
            res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
            return;
        }
        const result = await qrcode_service_1.default.regenerateEventQRCodes(eventId, role);
        if (sendEmails) {
            const tickets = await server_1.prisma.ticket.findMany({
                where: { eventId },
                include: { order: true, event: true },
            });
            for (const ticket of tickets) {
                const qrData = JSON.parse(ticket.qrCodeData);
                emailQueue.push({
                    ticketId: ticket.id,
                    email: ticket.order.customerEmail,
                    qrImage: qrData.qrImage,
                    attendeeName: ticket.attendeeName,
                    eventName: ticket.event.name,
                });
            }
            processEmailQueue();
        }
        res.status(200).json({
            success: true,
            message: `Regenerated ${result.total} QR codes${sendEmails ? ' and queued emails' : ''}`,
            data: {
                total: result.total,
                tickets: result.tickets.slice(0, 10),
                emailQueueStatus: sendEmails ? `${emailQueue.length} emails queued` : 'Not queued',
            },
        });
    }
    catch (error) {
        console.error('Regenerate QR codes error:', error);
        res.status(500).json({ success: false, message: 'Failed to regenerate QR codes' });
    }
};
exports.regenerateEventQRCodes = regenerateEventQRCodes;
const regenerateTicketQRCode = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { ticketId } = req.params;
        const { role = 'PUBLIC', sendEmail = false } = req.body;
        const ticket = await server_1.prisma.ticket.findFirst({
            where: {
                id: ticketId,
                event: { organizer: { userId: user.id } },
            },
            include: { order: true, event: true },
        });
        if (!ticket) {
            res.status(404).json({ success: false, message: 'Ticket not found or unauthorized' });
            return;
        }
        const result = await qrcode_service_1.default.regenerateQRCode(ticketId, role);
        if (sendEmail) {
            emailQueue.push({
                ticketId: ticket.id,
                email: ticket.order.customerEmail,
                qrImage: result.qrImage,
                attendeeName: ticket.attendeeName,
                eventName: ticket.event.name,
            });
            processEmailQueue();
        }
        res.status(200).json({
            success: true,
            message: `QR code regenerated${sendEmail ? ' and email queued' : ''}`,
            data: result,
        });
    }
    catch (error) {
        console.error('Regenerate ticket QR code error:', error);
        res.status(500).json({ success: false, message: 'Failed to regenerate QR code' });
    }
};
exports.regenerateTicketQRCode = regenerateTicketQRCode;
const generateRoleSpecificQRCodes = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const { roles, sendEmails = false } = req.body;
        if (!roles || !Array.isArray(roles) || roles.length === 0) {
            res.status(400).json({ success: false, message: 'Roles array is required' });
            return;
        }
        const event = await server_1.prisma.event.findFirst({
            where: {
                id: eventId,
                organizer: { userId: user.id },
            },
        });
        if (!event) {
            res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
            return;
        }
        const tickets = await server_1.prisma.ticket.findMany({
            where: { eventId },
            include: { order: true, event: true },
        });
        const results = [];
        for (const role of roles) {
            const permissions = getPermissionsForRole(role);
            for (const ticket of tickets) {
                const { qrCode, signature, qrImage } = await qrcode_service_1.default.generateRoleSpecificQRCode(ticket.id, role, permissions);
                await server_1.prisma.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        qrCode,
                        qrCodeData: JSON.stringify({ qrImage, signature, role, permissions }),
                    },
                });
                results.push({
                    ticketId: ticket.id,
                    attendeeName: ticket.attendeeName,
                    role,
                    permissions,
                });
                if (sendEmails) {
                    emailQueue.push({
                        ticketId: ticket.id,
                        email: ticket.order.customerEmail,
                        qrImage,
                        attendeeName: ticket.attendeeName,
                        eventName: ticket.event.name,
                    });
                }
            }
        }
        if (sendEmails) {
            processEmailQueue();
        }
        res.status(200).json({
            success: true,
            message: `Generated ${results.length} role-specific QR codes`,
            data: {
                total: results.length,
                roles: roles,
                sendEmails: sendEmails ? 'Queued' : 'Not sent',
                results: results.slice(0, 10),
            },
        });
    }
    catch (error) {
        console.error('Generate role-specific QR codes error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate role-specific QR codes' });
    }
};
exports.generateRoleSpecificQRCodes = generateRoleSpecificQRCodes;
function getPermissionsForRole(role) {
    const permissionsMap = {
        'VIP': ['vip_access', 'backstage_access', 'early_entry', 'meet_and_greet'],
        'STAFF': ['staff_access', 'vendor_access', 'early_entry'],
        'MEDIA': ['media_access', 'photography', 'interview_access'],
        'SPONSOR': ['sponsor_lounge', 'networking_access', 'preferred_seating'],
        'VOLUNTEER': ['volunteer_area', 'staff_access'],
        'PUBLIC': ['general_admission'],
    };
    return permissionsMap[role] || permissionsMap['PUBLIC'];
}
const getDeliveryStatus = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const tickets = await server_1.prisma.ticket.findMany({
            where: { eventId },
            include: { order: true },
        });
        const status = {
            total: tickets.length,
            sent: tickets.filter(t => {
                const metadata = t.metadata;
                return metadata && metadata.emailStatus === 'sent';
            }).length,
            pending: tickets.filter(t => {
                const metadata = t.metadata;
                return !metadata || !metadata.emailStatus;
            }).length,
            failed: tickets.filter(t => {
                const metadata = t.metadata;
                return metadata && metadata.emailStatus === 'failed';
            }).length,
            details: tickets.map(t => {
                const metadata = t.metadata;
                return {
                    ticketId: t.id,
                    attendeeName: t.attendeeName,
                    email: t.order.customerEmail,
                    status: metadata && metadata.emailStatus ? metadata.emailStatus : 'pending',
                    sentAt: metadata && metadata.emailSentAt ? metadata.emailSentAt : null,
                    error: metadata && metadata.emailError ? metadata.emailError : null,
                };
            }),
        };
        res.status(200).json({ success: true, data: status });
    }
    catch (error) {
        console.error('Get delivery status error:', error);
        res.status(500).json({ success: false, message: 'Failed to get delivery status' });
    }
};
exports.getDeliveryStatus = getDeliveryStatus;
const queueBulkEmails = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const { batchSize = 50 } = req.body;
        const tickets = await server_1.prisma.ticket.findMany({
            where: { eventId },
            include: { order: true, event: true },
        });
        let queued = 0;
        for (const ticket of tickets) {
            const qrData = JSON.parse(ticket.qrCodeData);
            emailQueue.push({
                ticketId: ticket.id,
                email: ticket.order.customerEmail,
                qrImage: qrData.qrImage,
                attendeeName: ticket.attendeeName,
                eventName: ticket.event.name,
            });
            queued++;
        }
        processEmailQueue();
        res.status(200).json({
            success: true,
            message: `${queued} emails queued for sending`,
            data: { queued, batchSize, queueLength: emailQueue.length },
        });
    }
    catch (error) {
        console.error('Queue bulk emails error:', error);
        res.status(500).json({ success: false, message: 'Failed to queue emails' });
    }
};
exports.queueBulkEmails = queueBulkEmails;
//# sourceMappingURL=qrcode.controller.js.map