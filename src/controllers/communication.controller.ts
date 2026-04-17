// controllers/communication.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { prisma } from '../server';

// Queue for message processing
const messageQueue: Array<{ communicationId: string; recipientId: string }> = [];
let isProcessingQueue = false;

// Process message queue
async function processMessageQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (messageQueue.length > 0) {
    const batch = messageQueue.splice(0, 20);
    
    for (const item of batch) {
      try {
        await sendMessage(item.communicationId, item.recipientId);
      } catch (error) {
        console.error(`Failed to send message:`, error);
        await updateRecipientStatus(item.recipientId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  isProcessingQueue = false;
}

// Send individual message
async function sendMessage(communicationId: string, recipientId: string) {
  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: { event: true },
  });
  
  const recipient = await prisma.communicationRecipient.findUnique({
    where: { id: recipientId },
  });
  
  if (!communication || !recipient) return;
  
  // Check if user has opted out
  const optedOut = await prisma.communicationOptOut.findFirst({
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
  
  // Send email (integrate with your email service)
  console.log(`📧 Sending message to ${recipient.email}:`);
  console.log(`   Subject: ${communication.subject}`);
  console.log(`   Content: ${communication.content.substring(0, 100)}...`);
  
  // Update status
  await updateRecipientStatus(recipientId, 'sent');
  
  // Update communication counts
  await prisma.communication.update({
    where: { id: communicationId },
    data: {
      sentCount: { increment: 1 },
    },
  });
}

// Update recipient status
async function updateRecipientStatus(recipientId: string, status: string, error?: string) {
  const data: any = { status };
  if (status === 'sent') data.sentAt = new Date();
  if (status === 'opened') data.openedAt = new Date();
  if (status === 'clicked') data.clickedAt = new Date();
  if (status === 'opted_out') data.optedOutAt = new Date();
  if (error) data.error = error;
  
  await prisma.communicationRecipient.update({
    where: { id: recipientId },
    data,
  });
}

// Create and send bulk message
export const sendBulkMessage = async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Verify event ownership
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        organizerId: user.organizer.id,
      },
    });

    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
      return;
    }

    // Get recipients based on filters
    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: ['ACTIVE', 'USED'] },
      },
      include: {
        order: true,
      },
    });

    // Get unique recipients
    const recipientMap = new Map();
    for (const ticket of tickets) {
      const email = ticket.order.customerEmail;
      if (!recipientMap.has(email)) {
        recipientMap.set(email, {
          email,
          name: ticket.attendeeName,
          role: 'PUBLIC', // You can determine role from ticket or user data
        });
      }
    }

    let recipients = Array.from(recipientMap.values());
    
    // Filter by roles if specified
    if (roles && roles.length > 0) {
      recipients = recipients.filter(r => roles.includes(r.role));
    }

    // Check opt-outs
    const optedOut = await prisma.communicationOptOut.findMany({
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

    // Create communication record
    const communication = await prisma.communication.create({
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

    // Create recipient records
    const recipientRecords = [];
    for (const recipient of recipients) {
      const userRecord = await prisma.user.findFirst({
        where: { email: recipient.email },
      });
      
      const record = await prisma.communicationRecipient.create({
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
      
      // Add to queue if not scheduled
      if (!scheduleFor) {
        messageQueue.push({
          communicationId: communication.id,
          recipientId: record.id,
        });
      }
    }

    // Start processing queue
    if (!scheduleFor) {
      processMessageQueue();
      
      // Update communication status
      await prisma.communication.update({
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
  } catch (error) {
    console.error('Send bulk message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

// Get communication status
export const getCommunicationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.organizer) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { communicationId } = req.params;

    const communication = await prisma.communication.findFirst({
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
  } catch (error) {
    console.error('Get communication status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
};

// Track open (for email tracking pixel)
// Track open (for email tracking pixel)
export const trackOpen = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipientId } = req.params;
    
    await updateRecipientStatus(recipientId, 'opened');
    
    // First get the recipient to find the communicationId
    const recipient = await prisma.communicationRecipient.findUnique({
      where: { id: recipientId },
      select: { communicationId: true },
    });
    
    if (recipient) {
      await prisma.communication.update({
        where: { id: recipient.communicationId },
        data: {
          openCount: { increment: 1 },
        },
      });
    }
    
    // Return transparent pixel
    res.setHeader('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (error) {
    console.error('Track open error:', error);
    res.status(204).send();
  }
};

// Track click
export const trackClick = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipientId, url } = req.params;
    
    await updateRecipientStatus(recipientId, 'clicked');
    
    // First get the recipient to find the communicationId
    const recipient = await prisma.communicationRecipient.findUnique({
      where: { id: recipientId },
      select: { communicationId: true },
    });
    
    if (recipient) {
      await prisma.communication.update({
        where: { id: recipient.communicationId },
        data: {
          clickCount: { increment: 1 },
        },
      });
    }
    
    // Redirect to original URL
    const decodedUrl = Buffer.from(url, 'base64').toString();
    res.redirect(decodedUrl);
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).send('Error tracking click');
  }
};

// Opt out from communications
export const optOut = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, eventId } = req.body;
    
    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }
    const whereCondition: any = {
      email: email,
    };
    if (eventId) {
      whereCondition.eventId = eventId;
    } else {
      whereCondition.eventId = null;
    }
    await prisma.communicationOptOut.upsert({
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
    
    // Update any pending recipients
    if (eventId) {
      await prisma.communicationRecipient.updateMany({
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
  } catch (error) {
    console.error('Opt out error:', error);
    res.status(500).json({ success: false, message: 'Failed to opt out' });
  }
};

// Get communication history for event
export const getEventCommunications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.organizer) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { eventId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const communications = await prisma.communication.findMany({
      where: {
        eventId,
        organizerId: user.organizer.id,
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
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
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: communications.length,
        },
      },
    });
  } catch (error) {
    console.error('Get event communications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get communications' });
  }
};