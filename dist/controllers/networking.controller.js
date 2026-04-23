"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnections = exports.getMessages = exports.sendMessage = exports.respondToConnection = exports.sendConnectionRequest = exports.updateNetworkingProfile = exports.getNetworkingSuggestions = void 0;
const server_1 = require("../server");
const networkingCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000;
function calculateConnectionScore(user1, user2, commonInterests, sameIndustry, sameJobLevel) {
    let score = 0;
    score += Math.min(commonInterests.length * 10, 40);
    if (sameIndustry)
        score += 20;
    if (sameJobLevel)
        score += 15;
    if (user1?.optIn && user2?.optIn)
        score += 10;
    score += 15;
    return Math.min(score, 100);
}
function getMatchReason(commonInterests, sameIndustry, sameJobLevel, score) {
    if (score > 80)
        return 'Excellent match! Very similar professional background and interests.';
    if (score > 60)
        return 'Great match based on your interests and industry.';
    if (commonInterests.length > 0)
        return `You share ${commonInterests.length} common interest(s).`;
    if (sameIndustry)
        return 'Working in the same industry.';
    if (sameJobLevel)
        return 'Similar professional level.';
    return 'Attending the same event.';
}
const getNetworkingSuggestions = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.query;
        const limit = parseInt(req.query.limit) || 20;
        if (!eventId) {
            res.status(400).json({ success: false, message: 'Event ID is required' });
            return;
        }
        const cacheKey = `networking_${user.id}_${eventId}_${limit}`;
        const cached = networkingCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            res.status(200).json({ success: true, data: cached.data, cached: true });
            return;
        }
        let userProfile = await server_1.prisma.networkingProfile.findUnique({
            where: { userId: user.id }
        });
        if (!userProfile) {
            userProfile = await server_1.prisma.networkingProfile.create({
                data: {
                    userId: user.id,
                    eventId: eventId,
                    optIn: true,
                    interests: []
                }
            });
        }
        const eventTickets = await server_1.prisma.ticket.findMany({
            where: {
                eventId: eventId,
                status: { in: ['ACTIVE', 'USED'] }
            },
            include: {
                order: true
            }
        });
        const attendeeEmails = [...new Set(eventTickets.map(t => t.order.customerEmail))];
        const otherUsers = await server_1.prisma.user.findMany({
            where: {
                email: { in: attendeeEmails },
                id: { not: user.id }
            },
            include: {
                networkingProfile: true
            }
        });
        const existingConnections = await server_1.prisma.connection.findMany({
            where: {
                OR: [
                    { fromUserId: user.id, eventId: eventId },
                    { toUserId: user.id, eventId: eventId }
                ]
            }
        });
        const connectedUserIds = new Set();
        existingConnections.forEach(conn => {
            connectedUserIds.add(conn.fromUserId);
            connectedUserIds.add(conn.toUserId);
        });
        const suggestions = [];
        for (const otherUser of otherUsers) {
            if (connectedUserIds.has(otherUser.id))
                continue;
            const commonInterests = (userProfile.interests || []).filter(i => (otherUser.networkingProfile?.interests || []).includes(i));
            const sameIndustry = userProfile.company === otherUser.networkingProfile?.company;
            const sameJobLevel = userProfile.jobTitle?.split(' ')[0] === otherUser.networkingProfile?.jobTitle?.split(' ')[0];
            const score = calculateConnectionScore(userProfile, otherUser.networkingProfile, commonInterests, sameIndustry, sameJobLevel);
            if (score > 20) {
                suggestions.push({
                    userId: otherUser.id,
                    name: `${otherUser.firstName} ${otherUser.lastName}`,
                    email: otherUser.email,
                    role: otherUser.role,
                    jobTitle: otherUser.networkingProfile?.jobTitle,
                    company: otherUser.networkingProfile?.company,
                    interests: otherUser.networkingProfile?.interests || [],
                    connectionScore: score,
                    commonInterests,
                    matchReason: getMatchReason(commonInterests, sameIndustry, sameJobLevel, score)
                });
            }
        }
        suggestions.sort((a, b) => b.connectionScore - a.connectionScore);
        const response = {
            eventId,
            suggestions: suggestions.slice(0, limit),
            totalSuggestions: suggestions.length,
            yourProfile: {
                interests: userProfile.interests,
                optIn: userProfile.optIn,
                jobTitle: userProfile.jobTitle,
                company: userProfile.company
            }
        };
        networkingCache.set(cacheKey, {
            data: response,
            expiresAt: Date.now() + CACHE_DURATION
        });
        res.status(200).json({ success: true, data: response, cached: false });
    }
    catch (error) {
        console.error('Networking suggestions error:', error);
        res.status(500).json({ success: false, message: 'Failed to get suggestions' });
    }
};
exports.getNetworkingSuggestions = getNetworkingSuggestions;
const updateNetworkingProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId, optIn, interests, jobTitle, company, linkedIn, twitter, bio } = req.body;
        if (!eventId) {
            res.status(400).json({ success: false, message: 'Event ID is required' });
            return;
        }
        const profile = await server_1.prisma.networkingProfile.upsert({
            where: { userId: user.id },
            update: {
                eventId,
                optIn: optIn !== undefined ? optIn : undefined,
                interests: interests || undefined,
                jobTitle,
                company,
                linkedIn,
                twitter,
                bio
            },
            create: {
                userId: user.id,
                eventId,
                optIn: optIn !== undefined ? optIn : true,
                interests: interests || [],
                jobTitle,
                company,
                linkedIn,
                twitter,
                bio
            }
        });
        networkingCache.clear();
        res.status(200).json({
            success: true,
            message: 'Networking profile updated',
            data: profile
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
};
exports.updateNetworkingProfile = updateNetworkingProfile;
const sendConnectionRequest = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { toUserId, eventId } = req.body;
        if (!toUserId || !eventId) {
            res.status(400).json({ success: false, message: 'User ID and Event ID are required' });
            return;
        }
        const existing = await server_1.prisma.connection.findFirst({
            where: {
                OR: [
                    { fromUserId: user.id, toUserId, eventId },
                    { fromUserId: toUserId, toUserId: user.id, eventId }
                ]
            }
        });
        if (existing) {
            res.status(400).json({ success: false, message: 'Connection request already exists' });
            return;
        }
        const connection = await server_1.prisma.connection.create({
            data: {
                fromUserId: user.id,
                toUserId,
                eventId,
                status: 'pending'
            }
        });
        res.status(200).json({
            success: true,
            message: 'Connection request sent',
            data: connection
        });
    }
    catch (error) {
        console.error('Send connection error:', error);
        res.status(500).json({ success: false, message: 'Failed to send connection request' });
    }
};
exports.sendConnectionRequest = sendConnectionRequest;
const respondToConnection = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { connectionId, accept } = req.body;
        if (!connectionId) {
            res.status(400).json({ success: false, message: 'Connection ID is required' });
            return;
        }
        const connection = await server_1.prisma.connection.findFirst({
            where: {
                id: connectionId,
                toUserId: user.id
            }
        });
        if (!connection) {
            res.status(404).json({ success: false, message: 'Connection not found' });
            return;
        }
        const updated = await server_1.prisma.connection.update({
            where: { id: connectionId },
            data: {
                status: accept ? 'accepted' : 'declined',
                connectedAt: accept ? new Date() : undefined
            }
        });
        res.status(200).json({
            success: true,
            message: accept ? 'Connection accepted' : 'Connection declined',
            data: updated
        });
    }
    catch (error) {
        console.error('Respond to connection error:', error);
        res.status(500).json({ success: false, message: 'Failed to respond' });
    }
};
exports.respondToConnection = respondToConnection;
const sendMessage = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { connectionId, content } = req.body;
        if (!connectionId || !content) {
            res.status(400).json({ success: false, message: 'Connection ID and content are required' });
            return;
        }
        const connection = await server_1.prisma.connection.findFirst({
            where: {
                id: connectionId,
                OR: [
                    { fromUserId: user.id },
                    { toUserId: user.id }
                ],
                status: 'accepted'
            }
        });
        if (!connection) {
            res.status(404).json({ success: false, message: 'Connection not found or not accepted yet' });
            return;
        }
        const message = await server_1.prisma.message.create({
            data: {
                connectionId,
                fromUserId: user.id,
                toUserId: connection.fromUserId === user.id ? connection.toUserId : connection.fromUserId,
                eventId: connection.eventId,
                content
            }
        });
        res.status(200).json({
            success: true,
            message: 'Message sent',
            data: message
        });
    }
    catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
};
exports.sendMessage = sendMessage;
const getMessages = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { connectionId } = req.query;
        if (!connectionId || typeof connectionId !== 'string') {
            res.status(400).json({ success: false, message: 'Valid Connection ID is required' });
            return;
        }
        const messages = await server_1.prisma.message.findMany({
            where: { connectionId },
            orderBy: { createdAt: 'asc' }
        });
        await server_1.prisma.message.updateMany({
            where: {
                connectionId,
                toUserId: user.id,
                isRead: false
            },
            data: {
                isRead: true,
                readAt: new Date()
            }
        });
        res.status(200).json({
            success: true,
            data: messages
        });
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: 'Failed to get messages' });
    }
};
exports.getMessages = getMessages;
const getConnections = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { eventId } = req.query;
        const connections = await server_1.prisma.connection.findMany({
            where: {
                OR: [
                    { fromUserId: user.id },
                    { toUserId: user.id }
                ],
                ...(eventId && typeof eventId === 'string' ? { eventId } : {})
            },
            include: {
                fromUser: {
                    select: { id: true, firstName: true, lastName: true, email: true, role: true }
                },
                toUser: {
                    select: { id: true, firstName: true, lastName: true, email: true, role: true }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { matchedAt: 'desc' }
        });
        const formattedConnections = connections.map(conn => {
            const otherUser = conn.fromUserId === user.id ? conn.toUser : conn.fromUser;
            return {
                id: conn.id,
                user: otherUser,
                status: conn.status,
                matchedAt: conn.matchedAt,
                connectedAt: conn.connectedAt,
                lastMessage: conn.messages[0],
                unreadCount: conn.messages.filter(m => m.toUserId === user.id && !m.isRead).length
            };
        });
        res.status(200).json({
            success: true,
            data: formattedConnections
        });
    }
    catch (error) {
        console.error('Get connections error:', error);
        res.status(500).json({ success: false, message: 'Failed to get connections' });
    }
};
exports.getConnections = getConnections;
//# sourceMappingURL=networking.controller.js.map