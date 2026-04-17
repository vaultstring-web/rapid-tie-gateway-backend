// controllers/networking.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { prisma } from '../server';

// Cache for networking data
const networkingCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Calculate connection score between two users
function calculateConnectionScore(
  user1: any,
  user2: any,
  commonInterests: string[],
  sameIndustry: boolean,
  sameJobLevel: boolean
): number {
  let score = 0;
  
  // Common interests (max 40 points)
  score += Math.min(commonInterests.length * 10, 40);
  
  // Same industry (20 points)
  if (sameIndustry) score += 20;
  
  // Same job level (15 points)
  if (sameJobLevel) score += 15;
  
  // Both opted in for networking (10 points)
  if (user1?.optIn && user2?.optIn) score += 10;
  
  // Same event attendance (15 points)
  score += 15;
  
  return Math.min(score, 100);
}

function getMatchReason(commonInterests: string[], sameIndustry: boolean, sameJobLevel: boolean, score: number): string {
  if (score > 80) return 'Excellent match! Very similar professional background and interests.';
  if (score > 60) return 'Great match based on your interests and industry.';
  if (commonInterests.length > 0) return `You share ${commonInterests.length} common interest(s).`;
  if (sameIndustry) return 'Working in the same industry.';
  if (sameJobLevel) return 'Similar professional level.';
  return 'Attending the same event.';
}

export const getNetworkingSuggestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { eventId } = req.query;
    const limit = parseInt(req.query.limit as string) || 20;
    
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

    // Get user's networking profile for this event
    let userProfile = await prisma.networkingProfile.findUnique({
      where: { userId: user.id }
    });

    // Create profile if doesn't exist
    if (!userProfile) {
      userProfile = await prisma.networkingProfile.create({
        data: {
          userId: user.id,
          eventId: eventId as string,
          optIn: true,
          interests: []
        }
      });
    }

    // Get other attendees for this event
    const eventTickets = await prisma.ticket.findMany({
      where: {
        eventId: eventId as string,
        status: { in: ['ACTIVE', 'USED'] }
      },
      include: {
        order: true
      }
    });

    // Get unique user emails from tickets
    const attendeeEmails = [...new Set(eventTickets.map(t => t.order.customerEmail))];
    
    // Get other users
    const otherUsers = await prisma.user.findMany({
      where: {
        email: { in: attendeeEmails },
        id: { not: user.id }
      },
      include: {
        networkingProfile: true
      }
    });

    // Get existing connections
    const existingConnections = await prisma.connection.findMany({
      where: {
        OR: [
          { fromUserId: user.id, eventId: eventId as string },
          { toUserId: user.id, eventId: eventId as string }
        ]
      }
    });

    const connectedUserIds = new Set<string>();
    existingConnections.forEach(conn => {
      connectedUserIds.add(conn.fromUserId);
      connectedUserIds.add(conn.toUserId);
    });

    // Calculate suggestions
    const suggestions = [];
    for (const otherUser of otherUsers) {
      if (connectedUserIds.has(otherUser.id)) continue;
      
      const commonInterests = (userProfile.interests as string[] || []).filter(i => 
        (otherUser.networkingProfile?.interests as string[] || []).includes(i)
      );
      
      const sameIndustry = userProfile.company === otherUser.networkingProfile?.company;
      const sameJobLevel = userProfile.jobTitle?.split(' ')[0] === otherUser.networkingProfile?.jobTitle?.split(' ')[0];
      
      const score = calculateConnectionScore(
        userProfile,
        otherUser.networkingProfile,
        commonInterests,
        sameIndustry,
        sameJobLevel
      );
      
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
  } catch (error) {
    console.error('Networking suggestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get suggestions' });
  }
};

export const updateNetworkingProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const profile = await prisma.networkingProfile.upsert({
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
    
    // Clear cache
    networkingCache.clear();
    
    res.status(200).json({
      success: true,
      message: 'Networking profile updated',
      data: profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

export const sendConnectionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Check if connection already exists
    const existing = await prisma.connection.findFirst({
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
    
    const connection = await prisma.connection.create({
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
  } catch (error) {
    console.error('Send connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to send connection request' });
  }
};

export const respondToConnection = async (req: AuthRequest, res: Response): Promise<void> => {
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
    
    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        toUserId: user.id
      }
    });
    
    if (!connection) {
      res.status(404).json({ success: false, message: 'Connection not found' });
      return;
    }
    
    const updated = await prisma.connection.update({
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
  } catch (error) {
    console.error('Respond to connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to respond' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
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
    
    const connection = await prisma.connection.findFirst({
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
    
    const message = await prisma.message.create({
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
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
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
    
    const messages = await prisma.message.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'asc' }
    });
    
    // Mark messages as read
    await prisma.message.updateMany({
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
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get messages' });
  }
};
export const getConnections = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { eventId } = req.query;
    
    const connections = await prisma.connection.findMany({
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
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ success: false, message: 'Failed to get connections' });
  }
};