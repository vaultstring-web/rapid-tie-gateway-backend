"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventCommunications = exports.optOut = exports.trackClick = exports.trackOpen = exports.getCommunicationStatus = exports.sendBulkMessage = void 0;
const server_1 = require("../server");
const messageQueue = [];
let isProcessingQueue = false;
async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0)
        return;
    isProcessingQueue = true;
    while (messageQueue.length > 0) {
        const batch = messageQueue.splice(0, 20);
        for (const item of batch) {
            try {
                await sendMessage(item.communicationId, item.recipientId);
            }
            catch (error) {
                console.error(`Failed to send message:`, error);
                await updateRecipientStatus(item.recipientId, 'failed', error instanceof Error ? error.message : 'Unknown error');
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    isProcessingQueue = false;
}
async function sendMessage(communicationId, recipientId) {
    const communication = await server_1.prisma.communication.findUnique({
        where: { id: communicationId },
        include: { event: true },
    });
    const recipient = await server_1.prisma.communicationRecipient.findUnique({
        where: { id: recipientId },
    });
    if (!communication || !recipient)
        return;
    const optedOut = await server_1.prisma.communicationOptOut.findFirst({
        where: {
            email: recipient.email,
            OR: [
                { eventId: communication.eventId },
                { eventId: null },
            ],
        },
    });
    if (optedOut) {
        await updateRecipientStatus(recipientId, 'opted_out');
        return;
    }
    console.log(`📧 Sending message to ${recipient.email}:`);
    console.log(`   Subject: ${communication.subject}`);
    console.log(`   Content: ${communication.content.substring(0, 100)}...`);
    await updateRecipientStatus(recipientId, 'sent');
    await server_1.prisma.communication.update({
        where: { id: communicationId },
        data: {
            sentCount: { increment: 1 },
        },
    });
}
async function updateRecipientStatus(recipientId, status, error) {
    const data = { status };
    if (status === 'sent')
        data.sentAt = new Date();
    if (status === 'opened')
        data.openedAt = new Date();
    if (status === 'clicked')
        data.clickedAt = new Date();
    if (status === 'opted_out')
        data.optedOutAt = new Date();
    if (error)
        data.error = error;
    await server_1.prisma.communicationRecipient.update({
        where: { id: recipientId },
        data,
    });
}
const sendBulkMessage = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.organizer) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const { subject, content, roles, contentType = 'email', scheduleFor } = req.body;
        if (!subject || !content) {
            res.status(400).json({ success: false, message: 'Subject and content are required' });
            return;
        }
        const event = await server_1.prisma.event.findFirst({
            where: {
                id: eventId,
                organizerId: user.organizer.id,
            },
        });
        if (!event) {
            res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
            return;
        }
        const tickets = await server_1.prisma.ticket.findMany({
            where: {
                eventId,
                status: { in: ['ACTIVE', 'USED'] },
            },
            include: {
                order: true,
            },
        });
        const recipientMap = new Map();
        for (const ticket of tickets) {
            const email = ticket.order.customerEmail;
            if (!recipientMap.has(email)) {
                recipientMap.set(email, {
                    email,
                    name: ticket.attendeeName,
                    role: 'PUBLIC',
                });
            }
        }
        let recipients = Array.from(recipientMap.values());
        if (roles && roles.length > 0) {
            recipients = recipients.filter(r => roles.includes(r.role));
        }
        const optedOut = await server_1.prisma.communicationOptOut.findMany({
            where: {
                email: { in: recipients.map(r => r.email) },
                OR: [
                    { eventId },
                    { eventId: null },
                ],
            },
        });
        const optedOutEmails = new Set(optedOut.map(o => o.email));
        recipients = recipients.filter(r => !optedOutEmails.has(r.email));
        const communication = await server_1.prisma.communication.create({
            data: {
                eventId,
                organizerId: user.organizer.id,
                subject,
                content,
                contentType,
                status: scheduleFor ? 'draft' : 'queued',
                filters: { roles: roles || [] },
                totalRecipients: recipients.length,
                scheduledFor: scheduleFor ? new Date(scheduleFor) : null,
            },
        });
        const recipientRecords = [];
        for (const recipient of recipients) {
            const userRecord = await server_1.prisma.user.findFirst({
                where: { email: recipient.email },
            });
            const record = await server_1.prisma.communicationRecipient.create({
                data: {
                    communicationId: communication.id,
                    userId: userRecord?.id,
                    email: recipient.email,
                    name: recipient.name,
                    role: recipient.role,
                    status: 'pending',
                },
            });
            recipientRecords.push(record);
            if (!scheduleFor) {
                messageQueue.push({
                    communicationId: communication.id,
                    recipientId: record.id,
                });
            }
        }
        if (!scheduleFor) {
            processMessageQueue();
            await server_1.prisma.communication.update({
                where: { id: communication.id },
                data: { status: 'sending' },
            });
        }
        res.status(201).json({
            success: true,
            message: `Message queued for ${recipients.length} recipients`,
            data: {
                communicationId: communication.id,
                totalRecipients: recipients.length,
                scheduledFor: scheduleFor || 'immediate',
                status: scheduleFor ? 'scheduled' : 'queued',
            },
        });
    }
    catch (error) {
        console.error('Send bulk message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
};
exports.sendBulkMessage = sendBulkMessage;
const getCommunicationStatus = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.organizer) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { communicationId } = req.params;
        const communication = await server_1.prisma.communication.findFirst({
            where: {
                id: communicationId,
                organizerId: user.organizer.id,
            },
            include: {
                recipients: true,
            },
        });
        if (!communication) {
            res.status(404).json({ success: false, message: 'Communication not found' });
            return;
        }
        const status = {
            id: communication.id,
            subject: communication.subject,
            status: communication.status,
            totalRecipients: communication.totalRecipients,
            sentCount: communication.sentCount,
            openCount: communication.openCount,
            clickCount: communication.clickCount,
            openRate: communication.totalRecipients > 0
                ? ((communication.openCount / communication.totalRecipients) * 100).toFixed(1)
                : '0',
            clickRate: communication.totalRecipients > 0
                ? ((communication.clickCount / communication.totalRecipients) * 100).toFixed(1)
                : '0',
            recipients: {
                total: communication.recipients.length,
                sent: communication.recipients.filter(r => r.status === 'sent').length,
                delivered: communication.recipients.filter(r => r.status === 'delivered').length,
                opened: communication.recipients.filter(r => r.status === 'opened').length,
                clicked: communication.recipients.filter(r => r.status === 'clicked').length,
                failed: communication.recipients.filter(r => r.status === 'failed').length,
                optedOut: communication.recipients.filter(r => r.status === 'opted_out').length,
            },
            createdAt: communication.createdAt,
            sentAt: communication.sentAt,
        };
        res.status(200).json({ success: true, data: status });
    }
    catch (error) {
        console.error('Get communication status error:', error);
        res.status(500).json({ success: false, message: 'Failed to get status' });
    }
};
exports.getCommunicationStatus = getCommunicationStatus;
const trackOpen = async (req, res) => {
    try {
        const { recipientId } = req.params;
        await updateRecipientStatus(recipientId, 'opened');
        const recipient = await server_1.prisma.communicationRecipient.findUnique({
            where: { id: recipientId },
            select: { communicationId: true },
        });
        if (recipient) {
            await server_1.prisma.communication.update({
                where: { id: recipient.communicationId },
                data: {
                    openCount: { increment: 1 },
                },
            });
        }
        res.setHeader('Content-Type', 'image/gif');
        res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
    catch (error) {
        console.error('Track open error:', error);
        res.status(204).send();
    }
};
exports.trackOpen = trackOpen;
const trackClick = async (req, res) => {
    try {
        const { recipientId, url } = req.params;
        await updateRecipientStatus(recipientId, 'clicked');
        const recipient = await server_1.prisma.communicationRecipient.findUnique({
            where: { id: recipientId },
            select: { communicationId: true },
        });
        if (recipient) {
            await server_1.prisma.communication.update({
                where: { id: recipient.communicationId },
                data: {
                    clickCount: { increment: 1 },
                },
            });
        }
        const decodedUrl = Buffer.from(url, 'base64').toString();
        res.redirect(decodedUrl);
    }
    catch (error) {
        console.error('Track click error:', error);
        res.status(500).send('Error tracking click');
    }
};
exports.trackClick = trackClick;
const optOut = async (req, res) => {
    try {
        const { email, eventId } = req.body;
        if (!email) {
            res.status(400).json({ success: false, message: 'Email is required' });
            return;
        }
        const whereCondition = {
            email: email,
        };
        if (eventId) {
            whereCondition.eventId = eventId;
        }
        else {
            whereCondition.eventId = null;
        }
        await server_1.prisma.communicationOptOut.upsert({
            where: {
                email_eventId: {
                    email,
                    eventId: eventId || null,
                },
            },
            update: {
                reason: 'User requested opt-out',
            },
            create: {
                email,
                eventId: eventId || null,
                reason: 'User requested opt-out',
            },
        });
        if (eventId) {
            await server_1.prisma.communicationRecipient.updateMany({
                where: {
                    email,
                    communication: { eventId },
                    status: 'pending',
                },
                data: {
                    status: 'opted_out',
                    optedOutAt: new Date(),
                },
            });
        }
        res.status(200).json({
            success: true,
            message: eventId ? 'Unsubscribed from event communications' : 'Unsubscribed from all communications',
        });
    }
    catch (error) {
        console.error('Opt out error:', error);
        res.status(500).json({ success: false, message: 'Failed to opt out' });
    }
};
exports.optOut = optOut;
const getEventCommunications = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.organizer) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        const communications = await server_1.prisma.communication.findMany({
            where: {
                eventId,
                organizerId: user.organizer.id,
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset),
            include: {
                recipients: {
                    select: {
                        status: true,
                        sentAt: true,
                        openedAt: true,
                    },
                },
            },
        });
        const formatted = communications.map(comm => ({
            id: comm.id,
            subject: comm.subject,
            status: comm.status,
            totalRecipients: comm.totalRecipients,
            sentCount: comm.sentCount,
            openCount: comm.openCount,
            openRate: comm.totalRecipients > 0 ? ((comm.openCount / comm.totalRecipients) * 100).toFixed(1) : '0',
            createdAt: comm.createdAt,
            sentAt: comm.sentAt,
        }));
        res.status(200).json({
            success: true,
            data: {
                communications: formatted,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total: communications.length,
                },
            },
        });
    }
    catch (error) {
        console.error('Get event communications error:', error);
        res.status(500).json({ success: false, message: 'Failed to get communications' });
    }
};
exports.getEventCommunications = getEventCommunications;
//# sourceMappingURL=communication.controller.js.map