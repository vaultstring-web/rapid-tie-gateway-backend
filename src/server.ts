import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
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

  socket.on('authenticate', (token: string) => {
    socket.join(`user-${token}`);
  });

  // Handle joining event rooms for real-time sales updates
  socket.on('join-event-sales', async (eventId: string) => {
    socket.join(`event-${eventId}`);
    logger.info(`Client ${socket.id} joined event-${eventId} sales room`);
    
    // Send immediate update when joining
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
      
      const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
      const totalTicketsSold = sales.reduce((sum, sale) => sum + sale.tickets.length, 0);
      
      socket.emit('sales-update', {
        eventId,
        totalRevenue,
        totalTicketsSold,
        lastUpdate: new Date().toISOString(),
        recentSales: sales
      });
    } catch (error) {
      logger.error('Error sending initial sales data:', error);
    }
  });

  socket.on('leave-event-sales', (eventId: string) => {
    socket.leave(`event-${eventId}`);
    logger.info(`Client ${socket.id} left event-${eventId} sales room`);
  });

  socket.on('disconnect', () => {
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

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalTicketsSold = sales.reduce((sum, sale) => sum + sale.tickets.length, 0);

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

export { io, prisma, emitSalesUpdate };