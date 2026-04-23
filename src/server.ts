import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser'; // Fixed: changed 'cookieParser' to 'cookie-parser'
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import attendeesRoutes from './routes/attendees.routes';
// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes';
import merchantRoutes from './routes/merchant.routes';
import organizerRoutes from './routes/organizer.routes';
import employeeRoutes from './routes/employee.routes';
import approverRoutes from './routes/approver.routes';
import financeRoutes from './routes/finance.routes';
import adminRoutes from './routes/admin.routes';
import eventRoutes from './routes/event.routes';
import paymentRoutes from './routes/payment.routes';
import webhookRoutes from './routes/webhook.routes';
import orderRoutes from './routes/order.routes';
import salesRoutes from './routes/sale.routes';
import analyticsRoutes from './routes/analytics.routes';
import universalRoutes from './routes/universal.routes';
import recommendationsRoutes from './routes/recommendations.routes';
import calendarRoutes from './routes/calendar.routes';
import networkingRoutes from './routes/networking.routes';
import notificationRoutes from './routes/notification.routes';
import qrcodeRoutes from './routes/qrcode.routes';
import communicationRoutes from './routes/communication.routes';
import adminMerchantRoutes from './routes/admin/merchantManagement.routes'; 
import adminUserRoutes from './routes/admin/userManagement.routes';
import adminHealthRoutes from './routes/admin/systemHealth.routes';
import adminJobRoutes from './routes/admin/jobManagement.routes';
import { initializeRecurringJobs } from './controllers/admin/jobManagement.controller';
import adminTransactionRoutes from './routes/admin/transactionMonitor.routes';
import adminSecurityRoutes from './routes/admin/securityDashboard.routes';
import adminAuditRoutes from './routes/admin/auditLog.routes';
import adminFraudRoutes from './routes/admin/fraudDetection.routes';
// Import transaction monitor WebSocket functions
import { 
  addMonitorConnection, 
  removeMonitorConnection,
} from './controllers/admin/transactionMonitor.controller';

// Import middleware
import { errorHandler } from './utils/errorHandler';
import { notfound } from './middlewares/notfound';
import { logger } from './utils/logger';

// Initialize Express
const app: Application = express();
const httpServer = createServer(app);

// Initialize Prisma
const prisma = new PrismaClient();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/api', limiter);

// Static files
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    project: 'Rapid Tie Payment Gateway',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/organizer', organizerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/approver', approverRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/organizer', salesRoutes);
app.use('/api/organizer', attendeesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/events', universalRoutes);
app.use('/api/events', recommendationsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/events', networkingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/organizer', qrcodeRoutes); 
app.use('/api/organizer', communicationRoutes);
app.use('/api', communicationRoutes); 
app.use('/api/admin', adminMerchantRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/admin', adminHealthRoutes);
app.use('/api/admin', adminJobRoutes);
app.use('/api/admin', adminTransactionRoutes);
app.use('/api/admin', adminSecurityRoutes);
app.use('/api/admin', adminAuditRoutes);
app.use('/api/admin', adminFraudRoutes);
// Initialize recurring jobs after server starts
initializeRecurringJobs().catch(console.error);

// Error handling
app.use(notfound);
app.use(errorHandler);

// Initialize Socket.IO
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // AUTHENTICATION for notifications
  socket.on('authenticate', async (token: string) => {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not defined');
      }
      const decoded = jwt.verify(token, jwtSecret) as { id: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      
      if (user) {
        socket.join(`user-${user.id}`);
        logger.info(`User ${user.email} authenticated for notifications`);
        
        // Send unread count on connect
        const unreadCount = await prisma.notification.count({
          where: { userId: user.id, read: false },
        });
        socket.emit('unread-count', { count: unreadCount });
      } else {
        console.error('User not found for token');
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
    }
  });

  // Join notifications room
  socket.on('join-notifications', (userId: string) => {
    socket.join(`user-${userId}`);
    logger.info(`Client ${socket.id} joined notifications for user ${userId}`);
  });

  // Join event rooms for real-time sales updates
  socket.on('join-event-sales', async (eventId: string) => {
    socket.join(`event-${eventId}`);
    logger.info(`Client ${socket.id} joined event-${eventId} sales room`);
    
    try {
      const sales = await prisma.ticketSale.findMany({
        where: { eventId: eventId },
        include: {
          tickets: {
            include: {
              tier: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      
      const totalRevenue = sales.reduce((sum: number, sale: any) => sum + sale.totalAmount, 0);
      const totalTicketsSold = sales.reduce((sum: number, sale: any) => sum + sale.tickets.length, 0);
      
      socket.emit('sales-update', {
        eventId,
        totalRevenue,
        totalTicketsSold,
        lastUpdate: new Date().toISOString(),
        recentSales: sales
      });
    } catch (error) {
      console.error('Error sending initial sales data:', error);
    }
  });

  socket.on('leave-event-sales', (eventId: string) => {
    socket.leave(`event-${eventId}`);
    logger.info(`Client ${socket.id} left event-${eventId} sales room`);
  });

  // Handle real-time mark as read
  socket.on('mark-read', async (notificationId: string) => {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true, readAt: new Date() },
      });
      logger.info(`Notification ${notificationId} marked as read via socket`);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  });

  // ============================================
  // TRANSACTION MONITORING WEBSOCKET
  // ============================================
  
  // Join transaction monitoring (admin only)
  socket.on('join-transaction-monitor', async (data: { token: string }) => {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not defined');
      }
      const decoded = jwt.verify(data.token, jwtSecret) as { id: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      
      // Only allow admin users
      if (user && user.role === 'ADMIN') {
        addMonitorConnection(socket.id, socket);
        socket.emit('transaction-monitor-connected', { 
          status: 'connected', 
          message: 'Connected to transaction monitor',
          timestamp: new Date().toISOString()
        });
        logger.info(`Admin ${user.email} joined transaction monitor`);
      } else {
        socket.emit('transaction-monitor-error', { message: 'Unauthorized. Admin access required.' });
        logger.warn(`Unauthorized attempt to join transaction monitor from ${socket.id}`);
      }
    } catch (error) {
      console.error('Transaction monitor authentication error:', error);
      socket.emit('transaction-monitor-error', { message: 'Authentication failed' });
    }
  });

  // Leave transaction monitoring
  socket.on('leave-transaction-monitor', () => {
    removeMonitorConnection(socket.id);
    logger.info(`Client ${socket.id} left transaction monitor`);
  });

  // ============================================
  // END OF TRANSACTION MONITORING SECTION
  // ============================================

  socket.on('disconnect', () => {
    // Clean up transaction monitor connection on disconnect
    removeMonitorConnection(socket.id);
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Function to emit sales updates (can be called from other parts of the app)
const emitSalesUpdate = async (eventId: string) => {
  try {
    const sales = await prisma.ticketSale.findMany({
      where: { eventId: eventId },
      include: {
        tickets: {
          include: {
            tier: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const totalRevenue = sales.reduce((sum: number, sale: any) => sum + sale.totalAmount, 0);
    const totalTicketsSold = sales.reduce((sum: number, sale: any) => sum + sale.tickets.length, 0);

    io.to(`event-${eventId}`).emit('sales-update', {
      eventId,
      totalRevenue,
      totalTicketsSold,
      lastUpdate: new Date().toISOString(),
      recentSales: sales
    });
  } catch (error) {
    logger.error('Error emitting sales update:', error);
  }
};

// Function to emit notification to user
const emitNotification = (userId: string, notification: any) => {
  io.to(`user-${userId}`).emit('new-notification', notification);
};

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  logger.info(`
  ╔════════════════════════════════════════════╗
  ║     Rapid Tie Payment Gateway              ║
  ║     Server is running on port ${PORT}        ║
  ║     Environment: ${process.env.NODE_ENV}                 ║
  ║     Frontend: ${process.env.FRONTEND_URL}   ║
  ║     WebSocket: ws://localhost:${PORT}        ║
  ╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect();
    io.close();
    process.exit(0);
  });
});

export { io, prisma, emitSalesUpdate, emitNotification };