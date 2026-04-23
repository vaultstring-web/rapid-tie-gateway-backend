"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrendingEvents = exports.clearUniversalCache = exports.getUniversalEvents = void 0;
const server_1 = require("../server");
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
function calculateRelevanceScore(event, userRole, userHistory, userLocation) {
    let score = 0;
    const popularityScore = (event.eventViews?.length || 0) +
        (event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0);
    score += Math.min(popularityScore * 0.5, 30);
    if (event.visibility === 'public')
        score += 20;
    if (event.visibility === 'all-platform')
        score += 15;
    if (event.visibility === 'merchant-only' && userRole === 'MERCHANT')
        score += 25;
    switch (userRole) {
        case 'ORGANIZER':
            score += 10;
            break;
        case 'MERCHANT':
            if (event.category === 'Business' || event.category === 'Trade')
                score += 15;
            break;
        case 'EMPLOYEE':
            if (event.type === 'Corporate' || event.type === 'Training')
                score += 15;
            break;
        case 'PUBLIC':
            if (event.category === 'Entertainment' || event.category === 'Music')
                score += 10;
            break;
    }
    if (userLocation && event.city?.toLowerCase() === userLocation.toLowerCase()) {
        score += 25;
    }
    const daysUntilEvent = Math.ceil((new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilEvent >= 0 && daysUntilEvent <= 7) {
        score += 20;
    }
    else if (daysUntilEvent > 7 && daysUntilEvent <= 30) {
        score += 10;
    }
    else if (daysUntilEvent > 30) {
        score += 5;
    }
    else {
        score -= 10;
    }
    if (userHistory.averageTicketPrice) {
        const avgEventPrice = event.ticketTiers?.[0]?.price || event.amount || 0;
        if (avgEventPrice <= userHistory.averageTicketPrice * 1.2) {
            score += 10;
        }
    }
    if (userHistory.preferredCategories?.includes(event.category)) {
        score += 15;
    }
    const availableTickets = event.ticketTiers?.reduce((sum, tier) => sum + (tier.quantity - tier.sold), 0) || 0;
    score += Math.min(availableTickets / 10, 15);
    return Math.min(Math.max(score, 0), 100);
}
async function getUserHistory(userId) {
    if (!userId) {
        return {
            averageTicketPrice: 20000,
            preferredCategories: [],
            viewedEvents: [],
            purchasedEvents: []
        };
    }
    const userTickets = await server_1.prisma.ticket.findMany({
        where: {
            order: {
                customerEmail: userId
            }
        },
        include: {
            event: true,
            tier: true
        }
    });
    const viewedEvents = await server_1.prisma.eventView.findMany({
        where: { userId },
        select: { eventId: true }
    });
    const purchasedEvents = userTickets.map(t => t.eventId);
    const uniqueCategories = [...new Set(userTickets.map(t => t.event?.category))];
    const totalSpent = userTickets.reduce((sum, t) => sum + (t.tier?.price || 0), 0);
    const averageTicketPrice = userTickets.length > 0 ? totalSpent / userTickets.length : 20000;
    return {
        averageTicketPrice,
        preferredCategories: uniqueCategories.filter(Boolean),
        viewedEvents: viewedEvents.map(v => v.eventId),
        purchasedEvents
    };
}
function getUserLocation(req) {
    return req.query.location || 'Lilongwe';
}
const getUniversalEvents = async (req, res) => {
    try {
        const user = req.user;
        const userRole = user?.role || 'PUBLIC';
        const userId = user?.id;
        const userLocation = getUserLocation(req);
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const cacheKey = `universal_events_${userRole}_${userId || 'anonymous'}_${userLocation}_${limit}_${offset}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            console.log(`📦 Cache hit for ${cacheKey}`);
            res.status(200).json({
                success: true,
                data: cached.data,
                cached: true
            });
            return;
        }
        console.log(`🔄 Cache miss for ${cacheKey}, fetching fresh data...`);
        const userHistory = await getUserHistory(userId);
        const events = await server_1.prisma.event.findMany({
            where: {
                status: 'PUBLISHED',
                startDate: { gte: new Date() }
            },
            include: {
                organizer: {
                    select: {
                        organizationName: true,
                        id: true
                    }
                },
                ticketTiers: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        quantity: true,
                        sold: true
                    }
                },
                ticketSales: {
                    include: {
                        tickets: true
                    }
                },
                eventViews: true
            }
        });
        const scoredEvents = events.map(event => ({
            ...event,
            relevanceScore: calculateRelevanceScore(event, userRole, userHistory, userLocation),
            availableTickets: event.ticketTiers?.reduce((sum, tier) => sum + (tier.quantity - tier.sold), 0) || 0,
            isPopular: (event.eventViews?.length || 0) > 100,
            isTrending: checkIfTrending(event)
        }));
        const sortedEvents = scoredEvents.sort((a, b) => b.relevanceScore - a.relevanceScore);
        const paginatedEvents = sortedEvents.slice(offset, offset + limit);
        const formattedEvents = paginatedEvents.map(event => ({
            id: event.id,
            name: event.name,
            description: event.shortDescription || event.description,
            category: event.category,
            type: event.type,
            venue: event.venue,
            city: event.city,
            startDate: event.startDate,
            endDate: event.endDate,
            coverImage: event.coverImage,
            organizer: event.organizer.organizationName,
            visibility: event.visibility,
            relevanceScore: event.relevanceScore,
            availableTickets: event.availableTickets,
            priceRange: getPriceRange(event.ticketTiers),
            lowestPrice: Math.min(...(event.ticketTiers?.map((t) => t.price) || [0])),
            isPopular: event.isPopular,
            isTrending: event.isTrending,
            stats: {
                views: event.eventViews?.length || 0,
                ticketsSold: event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0,
                interested: Math.floor((event.eventViews?.length || 0) * 0.3)
            }
        }));
        const response = {
            events: formattedEvents,
            pagination: {
                total: sortedEvents.length,
                offset,
                limit,
                hasMore: offset + limit < sortedEvents.length
            },
            personalizedFor: {
                role: userRole,
                location: userLocation,
                recommendationsBasedOn: userHistory.purchasedEvents.length > 0 ? 'purchase_history' : 'popularity'
            }
        };
        cache.set(cacheKey, {
            data: response,
            expiresAt: Date.now() + CACHE_DURATION
        });
        res.status(200).json({
            success: true,
            data: response,
            cached: false
        });
        return;
    }
    catch (error) {
        console.error('Universal events error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events'
        });
        return;
    }
};
exports.getUniversalEvents = getUniversalEvents;
function checkIfTrending(event) {
    const viewsLastWeek = event.eventViews?.filter((view) => {
        const daysAgo = (Date.now() - new Date(view.viewedAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 7;
    }).length || 0;
    const salesLastWeek = event.ticketSales?.filter((sale) => {
        const daysAgo = (Date.now() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 7;
    }).reduce((sum, sale) => sum + sale.tickets.length, 0) || 0;
    return viewsLastWeek > 50 || salesLastWeek > 20;
}
function getPriceRange(tiers) {
    if (!tiers || tiers.length === 0)
        return 'Free';
    const prices = tiers.map((t) => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max)
        return `MWK ${min.toLocaleString()}`;
    return `MWK ${min.toLocaleString()} - ${max.toLocaleString()}`;
}
const clearUniversalCache = async (_req, res) => {
    try {
        cache.clear();
        res.status(200).json({
            success: true,
            message: 'Universal events cache cleared'
        });
        return;
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to clear cache'
        });
        return;
    }
};
exports.clearUniversalCache = clearUniversalCache;
const getTrendingEvents = async (_req, res) => {
    try {
        const events = await server_1.prisma.event.findMany({
            where: {
                status: 'PUBLISHED',
                startDate: { gte: new Date() }
            },
            include: {
                eventViews: true,
                ticketSales: {
                    include: {
                        tickets: true
                    }
                }
            },
            take: 10
        });
        const trending = events
            .map(event => ({
            ...event,
            trendingScore: checkIfTrending(event) ?
                (event.eventViews?.length || 0) + (event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0) : 0
        }))
            .sort((a, b) => b.trendingScore - a.trendingScore)
            .slice(0, 10)
            .map(event => ({
            id: event.id,
            name: event.name,
            category: event.category,
            city: event.city,
            views: event.eventViews?.length || 0,
            sales: event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0,
            trendingScore: event.trendingScore
        }));
        res.status(200).json({
            success: true,
            data: trending
        });
        return;
    }
    catch (error) {
        console.error('Trending events error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trending events'
        });
        return;
    }
};
exports.getTrendingEvents = getTrendingEvents;
//# sourceMappingURL=universal.controller.js.map