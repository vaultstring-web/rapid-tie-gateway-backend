"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRecommendationsCache = exports.getRecommendedEvents = void 0;
const server_1 = require("../server");
const recommendationCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000;
async function findSimilarUsers(userId) {
    const userTickets = await server_1.prisma.ticket.findMany({
        where: {
            order: {
                customerEmail: userId
            }
        },
        select: { eventId: true }
    });
    const userEventIds = userTickets.map(t => t.eventId);
    if (userEventIds.length === 0)
        return [];
    const similarUsers = await server_1.prisma.ticket.findMany({
        where: {
            eventId: { in: userEventIds },
            NOT: { order: { customerEmail: userId } }
        },
        include: {
            order: true
        },
        take: 50
    });
    const userSimilarity = new Map();
    similarUsers.forEach(ticket => {
        const otherUserId = ticket.order.customerEmail;
        if (otherUserId) {
            userSimilarity.set(otherUserId, (userSimilarity.get(otherUserId) || 0) + 1);
        }
    });
    return Array.from(userSimilarity.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId]) => userId);
}
async function getUserBehavior(userId, userRole, userEmail) {
    if (!userId && !userEmail) {
        return {
            userId: 'anonymous',
            userRole: userRole,
            attendedEvents: [],
            viewedEvents: [],
            interestedCategories: [],
            averageSpend: 0,
            preferredLocations: [],
            travelDestinations: [],
            merchantIndustry: undefined
        };
    }
    const tickets = await server_1.prisma.ticket.findMany({
        where: {
            order: {
                customerEmail: userEmail || userId
            }
        },
        include: {
            event: {
                include: {
                    ticketTiers: true
                }
            },
            tier: true
        }
    });
    const attendedEvents = tickets.map(t => t.eventId);
    const categories = [...new Set(tickets.map(t => t.event?.category).filter(Boolean))];
    const locations = [...new Set(tickets.map(t => t.event?.city).filter(Boolean))];
    const averageSpend = tickets.length > 0
        ? tickets.reduce((sum, t) => sum + (t.tier?.price || 0), 0) / tickets.length
        : 0;
    const views = await server_1.prisma.eventView.findMany({
        where: { userId: userId || undefined },
        select: { eventId: true }
    });
    const viewedEvents = views.map(v => v.eventId);
    let travelDestinations = [];
    if (userRole === 'EMPLOYEE' || userRole === 'APPROVER') {
        const userRecord = await server_1.prisma.user.findUnique({
            where: { id: userId },
            include: { employee: true }
        });
        if (userRecord?.employee) {
            const dsaRequests = await server_1.prisma.dsaRequest.findMany({
                where: { employeeId: userRecord.employee.id },
                select: { destination: true }
            });
            travelDestinations = [...new Set(dsaRequests.map(r => r.destination))];
        }
    }
    let merchantIndustry;
    if (userRole === 'MERCHANT') {
        const userRecord = await server_1.prisma.user.findUnique({
            where: { id: userId },
            include: { merchant: true }
        });
        merchantIndustry = userRecord?.merchant?.businessType || undefined;
    }
    return {
        userId: userId || 'anonymous',
        userRole,
        attendedEvents,
        viewedEvents,
        interestedCategories: categories,
        averageSpend,
        preferredLocations: locations,
        travelDestinations,
        merchantIndustry
    };
}
function calculateRecommendationScore(event, userBehavior, similarityScore = 0) {
    let score = 0;
    score += similarityScore * 30;
    if (userBehavior.attendedEvents.includes(event.id)) {
        return -1;
    }
    if (userBehavior.viewedEvents.includes(event.id)) {
        score += 15;
    }
    if (userBehavior.interestedCategories.includes(event.category)) {
        score += 20;
    }
    if (userBehavior.preferredLocations.includes(event.city)) {
        score += 15;
    }
    if (userBehavior.userRole === 'EMPLOYEE' && userBehavior.travelDestinations.includes(event.city)) {
        score += 25;
    }
    if (userBehavior.userRole === 'MERCHANT' && userBehavior.merchantIndustry) {
        const industryKeywords = ['Business', 'Trade', 'Conference', 'Networking'];
        if (industryKeywords.some(keyword => event.category?.includes(keyword))) {
            score += 20;
        }
    }
    if (userBehavior.userRole === 'ORGANIZER') {
        score += 10;
    }
    const eventPrice = event.ticketTiers?.[0]?.price || event.amount || 0;
    if (userBehavior.averageSpend > 0) {
        const priceRatio = eventPrice / userBehavior.averageSpend;
        if (priceRatio <= 1.2) {
            score += 10;
        }
        else if (priceRatio <= 1.5) {
            score += 5;
        }
    }
    const popularityScore = (event.eventViews?.length || 0) +
        (event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0);
    score += Math.min(popularityScore / 10, 15);
    const availableTickets = event.ticketTiers?.reduce((sum, tier) => sum + (tier.quantity - tier.sold), 0) || 0;
    if (availableTickets > 0) {
        score += Math.min(availableTickets / 20, 10);
    }
    const daysUntilEvent = Math.ceil((new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilEvent >= 0 && daysUntilEvent <= 14) {
        score += 10;
    }
    return Math.min(score, 100);
}
const getRecommendedEvents = async (req, res) => {
    try {
        const user = req.user;
        const userRole = user?.role || 'PUBLIC';
        const userId = user?.id;
        const userEmail = user?.email;
        const limit = parseInt(req.query.limit) || 10;
        const cacheKey = `recommendations_${userRole}_${userId || 'anonymous'}_${limit}`;
        const cached = recommendationCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            console.log(`📦 Recommendation cache hit for ${cacheKey}`);
            res.status(200).json({
                success: true,
                data: cached.data,
                cached: true
            });
            return;
        }
        console.log(`🔄 Generating recommendations for ${userRole} user...`);
        const userBehavior = await getUserBehavior(userId, userRole, userEmail);
        let similarUsers = [];
        let collaborativeRecommendations = new Map();
        if (userId && userBehavior.attendedEvents.length > 0) {
            similarUsers = await findSimilarUsers(userId);
            if (similarUsers.length > 0) {
                const similarUserTickets = await server_1.prisma.ticket.findMany({
                    where: {
                        order: {
                            customerEmail: { in: similarUsers }
                        }
                    },
                    include: {
                        event: true
                    }
                });
                similarUserTickets.forEach(ticket => {
                    if (!userBehavior.attendedEvents.includes(ticket.eventId)) {
                        const count = collaborativeRecommendations.get(ticket.eventId) || 0;
                        collaborativeRecommendations.set(ticket.eventId, count + 1);
                    }
                });
            }
        }
        const events = await server_1.prisma.event.findMany({
            where: {
                status: 'PUBLISHED',
                startDate: { gte: new Date() }
            },
            include: {
                organizer: {
                    select: {
                        organizationName: true
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
        const scoredEvents = events.map(event => {
            const collabScore = collaborativeRecommendations.get(event.id) || 0;
            const maxCollabScore = Math.max(...Array.from(collaborativeRecommendations.values()), 1);
            const normalizedCollabScore = (collabScore / maxCollabScore) * 100;
            const score = calculateRecommendationScore(event, userBehavior, normalizedCollabScore);
            return {
                ...event,
                recommendationScore: score,
                recommendationReason: getRecommendationReason(event, userBehavior, collabScore > 0),
                availableTickets: event.ticketTiers?.reduce((sum, tier) => sum + (tier.quantity - tier.sold), 0) || 0
            };
        });
        const validEvents = scoredEvents.filter(event => event.recommendationScore >= 0);
        const sortedEvents = validEvents.sort((a, b) => b.recommendationScore - a.recommendationScore);
        const topRecommendations = sortedEvents.slice(0, limit);
        const formattedRecommendations = topRecommendations.map(event => ({
            id: event.id,
            name: event.name,
            description: event.shortDescription || event.description,
            category: event.category,
            venue: event.venue,
            city: event.city,
            startDate: event.startDate,
            coverImage: event.coverImage,
            organizer: event.organizer.organizationName,
            recommendationScore: Math.round(event.recommendationScore),
            recommendationReason: event.recommendationReason,
            priceRange: getPriceRange(event.ticketTiers),
            lowestPrice: Math.min(...(event.ticketTiers?.map((t) => t.price) || [0])),
            availableTickets: event.availableTickets,
            stats: {
                views: event.eventViews?.length || 0,
                ticketsSold: event.ticketSales?.reduce((sum, sale) => sum + sale.tickets.length, 0) || 0
            }
        }));
        const response = {
            recommendations: formattedRecommendations,
            personalization: {
                basedOn: userBehavior.attendedEvents.length > 0 ? 'past_attendance_and_collaborative_filtering' : 'popularity_and_preferences',
                similarUsersFound: similarUsers.length,
                userInterests: {
                    categories: userBehavior.interestedCategories.slice(0, 5),
                    locations: userBehavior.preferredLocations.slice(0, 3),
                    travelDestinations: userBehavior.travelDestinations.slice(0, 3)
                }
            },
            totalRecommendations: sortedEvents.length
        };
        recommendationCache.set(cacheKey, {
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
        console.error('Recommendations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate recommendations'
        });
        return;
    }
};
exports.getRecommendedEvents = getRecommendedEvents;
function getRecommendationReason(event, userBehavior, isCollaborative) {
    if (isCollaborative) {
        return `Similar users attended this event`;
    }
    if (userBehavior.interestedCategories.includes(event.category)) {
        return `Based on your interest in ${event.category} events`;
    }
    if (userBehavior.preferredLocations.includes(event.city)) {
        return `Popular event in ${event.city}`;
    }
    if (userBehavior.userRole === 'EMPLOYEE' && userBehavior.travelDestinations.includes(event.city)) {
        return `Matches your travel destination: ${event.city}`;
    }
    if (userBehavior.userRole === 'MERCHANT' && event.category === 'Business') {
        return `Relevant for your business interests`;
    }
    return `Trending event with ${event.eventViews?.length || 0} views`;
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
const clearRecommendationsCache = async (_req, res) => {
    try {
        recommendationCache.clear();
        res.status(200).json({
            success: true,
            message: 'Recommendations cache cleared'
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
exports.clearRecommendationsCache = clearRecommendationsCache;
//# sourceMappingURL=recommendations.controller.js.map