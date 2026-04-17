// controllers/recommendations.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../server';

// Cache for recommendations
const recommendationCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// User behavior tracking interface
interface UserBehavior {
  userId: string;
  userRole: string;
  attendedEvents: string[];
  viewedEvents: string[];
  interestedCategories: string[];
  averageSpend: number;
  preferredLocations: string[];
  travelDestinations: string[]; // For DSA employees
  merchantIndustry?: string; // For merchants
}

// Collaborative filtering - find similar users
async function findSimilarUsers(userId: string): Promise<string[]> {
  // Find users with similar attendance patterns
  const userTickets = await prisma.ticket.findMany({
    where: {
      order: {
        customerEmail: userId
      }
    },
    select: { eventId: true }
  });

  const userEventIds = userTickets.map(t => t.eventId);
  
  if (userEventIds.length === 0) return [];

  // Find other users who attended similar events
  const similarUsers = await prisma.ticket.findMany({
    where: {
      eventId: { in: userEventIds },
      NOT: { order: { customerEmail: userId } }
    },
    include: {
      order: true
    },
    take: 50
  });

  // Count similarities
  const userSimilarity = new Map<string, number>();
  similarUsers.forEach(ticket => {
    const otherUserId = ticket.order.customerEmail;
    if (otherUserId) {
      userSimilarity.set(otherUserId, (userSimilarity.get(otherUserId) || 0) + 1);
    }
  });

  // Return top 10 similar users
  return Array.from(userSimilarity.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId]) => userId);
}

// Get user behavior profile
async function getUserBehavior(userId: string | undefined, userRole: string, userEmail?: string): Promise<UserBehavior> {
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

  // Get user's ticket purchases
  const tickets = await prisma.ticket.findMany({
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

  // Get viewed events
  const views = await prisma.eventView.findMany({
    where: { userId: userId || undefined },
    select: { eventId: true }
  });
  const viewedEvents = views.map(v => v.eventId);

  // For DSA employees - get travel destinations from their DSA requests
  let travelDestinations: string[] = [];
  if (userRole === 'EMPLOYEE' || userRole === 'APPROVER') {
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });
    
    if (userRecord?.employee) {
      const dsaRequests = await prisma.dsaRequest.findMany({
        where: { employeeId: userRecord.employee.id },
        select: { destination: true }
      });
      travelDestinations = [...new Set(dsaRequests.map(r => r.destination))];
    }
  }

  // For merchants - get their industry
  let merchantIndustry: string | undefined;
  if (userRole === 'MERCHANT') {
    const userRecord = await prisma.user.findUnique({
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

// Calculate recommendation score
function calculateRecommendationScore(
  event: any,
  userBehavior: UserBehavior,
  similarityScore: number = 0
): number {
  let score = 0;

  // Base score from collaborative filtering (users like you attended)
  score += similarityScore * 30;

  // Past attendance boost (don't recommend already attended)
  if (userBehavior.attendedEvents.includes(event.id)) {
    return -1; // Exclude already attended
  }

  // Viewed but not purchased (high interest)
  if (userBehavior.viewedEvents.includes(event.id)) {
    score += 15;
  }

  // Category interest (from past events)
  if (userBehavior.interestedCategories.includes(event.category)) {
    score += 20;
  }

  // Location preference (from past events)
  if (userBehavior.preferredLocations.includes(event.city)) {
    score += 15;
  }

  // DSA employees - travel destination match
  if (userBehavior.userRole === 'EMPLOYEE' && userBehavior.travelDestinations.includes(event.city)) {
    score += 25; // High boost for work-related travel
  }

  // Merchant - industry relevance
  if (userBehavior.userRole === 'MERCHANT' && userBehavior.merchantIndustry) {
    const industryKeywords = ['Business', 'Trade', 'Conference', 'Networking'];
    if (industryKeywords.some(keyword => event.category?.includes(keyword))) {
      score += 20;
    }
  }

  // Organizer - industry events
  if (userBehavior.userRole === 'ORGANIZER') {
    score += 10; // Organizers see all relevant events
  }

  // Price affinity (based on past spending)
  const eventPrice = event.ticketTiers?.[0]?.price || event.amount || 0;
  if (userBehavior.averageSpend > 0) {
    const priceRatio = eventPrice / userBehavior.averageSpend;
    if (priceRatio <= 1.2) {
      score += 10; // Within budget range
    } else if (priceRatio <= 1.5) {
      score += 5; // Slightly above budget
    }
  }

  // Popularity boost (events others are buying)
  const popularityScore = (event.eventViews?.length || 0) + 
                         (event.ticketSales?.reduce((sum: number, sale: any) => sum + sale.tickets.length, 0) || 0);
  score += Math.min(popularityScore / 10, 15);

  // Availability (tickets left)
  const availableTickets = event.ticketTiers?.reduce((sum: number, tier: any) => 
    sum + (tier.quantity - tier.sold), 0) || 0;
  if (availableTickets > 0) {
    score += Math.min(availableTickets / 20, 10);
  }

  // Upcoming events boost
  const daysUntilEvent = Math.ceil((new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntilEvent >= 0 && daysUntilEvent <= 14) {
    score += 10; // Events in next 2 weeks
  }

  return Math.min(score, 100);
}

export const getRecommendedEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const userRole = user?.role || 'PUBLIC';
    const userId = user?.id;
    const userEmail = user?.email;
    const limit = parseInt(req.query.limit as string) || 10;

    // Create cache key
    const cacheKey = `recommendations_${userRole}_${userId || 'anonymous'}_${limit}`;
    
    // Check cache
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

    // Get user behavior profile
    const userBehavior = await getUserBehavior(userId, userRole, userEmail);

    // Find similar users for collaborative filtering
    let similarUsers: string[] = [];
    let collaborativeRecommendations: Map<string, number> = new Map();

    if (userId && userBehavior.attendedEvents.length > 0) {
      similarUsers = await findSimilarUsers(userId);
      
      // Get events that similar users attended
      if (similarUsers.length > 0) {
        const similarUserTickets = await prisma.ticket.findMany({
          where: {
            order: {
              customerEmail: { in: similarUsers }
            }
          },
          include: {
            event: true
          }
        });
        
        // Count frequency of events among similar users
        similarUserTickets.forEach(ticket => {
          if (!userBehavior.attendedEvents.includes(ticket.eventId)) {
            const count = collaborativeRecommendations.get(ticket.eventId) || 0;
            collaborativeRecommendations.set(ticket.eventId, count + 1);
          }
        });
      }
    }

    // Fetch all upcoming events
    const events = await prisma.event.findMany({
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

    // Score each event
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

    // Filter out scored-out events (score < 0 means exclude)
    const validEvents = scoredEvents.filter(event => event.recommendationScore >= 0);
    
    // Sort by score (highest first)
    const sortedEvents = validEvents.sort((a, b) => b.recommendationScore - a.recommendationScore);
    
    // Take top N
    const topRecommendations = sortedEvents.slice(0, limit);

    // Format response
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
      lowestPrice: Math.min(...(event.ticketTiers?.map((t: any) => t.price) || [0])),
      availableTickets: event.availableTickets,
      stats: {
        views: event.eventViews?.length || 0,
        ticketsSold: event.ticketSales?.reduce((sum: number, sale: any) => sum + sale.tickets.length, 0) || 0
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

    // Cache the response
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
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations'
    });
    return;
  }
};

// Helper: Get recommendation reason
function getRecommendationReason(event: any, userBehavior: UserBehavior, isCollaborative: boolean): string {
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

// Helper: Get price range
function getPriceRange(tiers: any[]): string {
  if (!tiers || tiers.length === 0) return 'Free';
  const prices = tiers.map((t: any) => t.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `MWK ${min.toLocaleString()}`;
  return `MWK ${min.toLocaleString()} - ${max.toLocaleString()}`;
}

// Clear recommendations cache
export const clearRecommendationsCache = async (_req: Request, res: Response): Promise<void> => {
  try {
    recommendationCache.clear();
    res.status(200).json({
      success: true,
      message: 'Recommendations cache cleared'
    });
    return;
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache'
    });
    return;
  }
};