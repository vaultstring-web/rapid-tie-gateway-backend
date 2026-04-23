"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitNotification = exports.emitSalesUpdate = exports.prisma = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./utils/errorHandler");
const notfound_1 = require("./middlewares/notfound");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const merchant_routes_1 = __importDefault(require("./routes/merchant.routes"));
const organizer_routes_1 = __importDefault(require("./routes/organizer.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const approver_routes_1 = __importDefault(require("./routes/approver.routes"));
const finance_routes_1 = __importDefault(require("./routes/finance.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const event_routes_1 = __importDefault(require("./routes/event.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const sale_routes_1 = __importDefault(require("./routes/sale.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const attendees_routes_1 = __importDefault(require("./routes/attendees.routes"));
const universal_routes_1 = __importDefault(require("./routes/universal.routes"));
const recommendations_routes_1 = __importDefault(require("./routes/recommendations.routes"));
const calendar_routes_1 = __importDefault(require("./routes/calendar.routes"));
const networking_routes_1 = __importDefault(require("./routes/networking.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const qrcode_routes_1 = __importDefault(require("./routes/qrcode.routes"));
const communication_routes_1 = __importDefault(require("./routes/communication.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
});
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined', { stream: { write: (message) => logger_1.logger.info(message.trim()) } }));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
app.use('/api', limiter);
app.use('/uploads', express_1.default.static('uploads'));
app.get('/health', (_req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        project: 'Rapid Tie Payment Gateway',
    });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/merchant', merchant_routes_1.default);
app.use('/api/organizer', organizer_routes_1.default);
app.use('/api/employee', employee_routes_1.default);
app.use('/api/approver', approver_routes_1.default);
app.use('/api/finance', finance_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/webhooks', webhook_routes_1.default);
app.use('/api/events', event_routes_1.default);
app.use('/api/orders', order_routes_1.default);
app.use('/api/organizer', sale_routes_1.default);
app.use('/api/organizer', attendees_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/events', universal_routes_1.default);
app.use('/api/events', recommendations_routes_1.default);
app.use('/api/calendar', calendar_routes_1.default);
app.use('/api/events', networking_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/organizer', qrcode_routes_1.default);
app.use('/api/organizer', communication_routes_1.default);
app.use('/api', communication_routes_1.default);
app.use(notfound_1.notfound);
app.use(errorHandler_1.errorHandler);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    }
});
exports.io = io;
io.on('connection', (socket) => {
    logger_1.logger.info(`Client connected: ${socket.id}`);
    socket.on('authenticate', async (token) => {
        try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                throw new Error('JWT_SECRET not defined');
            }
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            const user = await prisma.user.findUnique({ where: { id: decoded.id } });
            if (user) {
                socket.join(`user-${user.id}`);
                logger_1.logger.info(`User ${user.email} authenticated for notifications`);
                const unreadCount = await prisma.notification.count({
                    where: { userId: user.id, read: false },
                });
                socket.emit('unread-count', { count: unreadCount });
            }
        }
        catch (error) {
            console.error('Socket authentication error:', error);
        }
    });
    socket.on('join-notifications', (userId) => {
        socket.join(`user-${userId}`);
        logger_1.logger.info(`Client ${socket.id} joined notifications for user ${userId}`);
    });
    socket.on('join-event-sales', async (eventId) => {
        socket.join(`event-${eventId}`);
        logger_1.logger.info(`Client ${socket.id} joined event-${eventId} sales room`);
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
        }
        catch (error) {
            console.error('Error sending initial sales data:', error);
        }
    });
    socket.on('leave-event-sales', (eventId) => {
        socket.leave(`event-${eventId}`);
        logger_1.logger.info(`Client ${socket.id} left event-${eventId} sales room`);
    });
    socket.on('mark-read', async (notificationId) => {
        try {
            await prisma.notification.update({
                where: { id: notificationId },
                data: { read: true, readAt: new Date() },
            });
            logger_1.logger.info(`Notification ${notificationId} marked as read via socket`);
        }
        catch (error) {
            console.error('Error marking notification as read:', error);
        }
    });
    socket.on('disconnect', () => {
        logger_1.logger.info(`Client disconnected: ${socket.id}`);
    });
});
const emitSalesUpdate = async (eventId) => {
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
    }
    catch (error) {
        logger_1.logger.error('Error emitting sales update:', error);
    }
};
exports.emitSalesUpdate = emitSalesUpdate;
const emitNotification = (userId, notification) => {
    io.to(`user-${userId}`).emit('new-notification', notification);
};
exports.emitNotification = emitNotification;
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    logger_1.logger.info(`
  ╔════════════════════════════════════════════╗
  ║     Rapid Tie Payment Gateway              ║
  ║     Server is running on port ${PORT}        ║
  ║     Environment: ${process.env.NODE_ENV}                 ║
  ║     Frontend: ${process.env.FRONTEND_URL}   ║
  ║     WebSocket: ws://localhost:${PORT}        ║
  ╚════════════════════════════════════════════╝
  `);
});
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        logger_1.logger.info('HTTP server closed');
        prisma.$disconnect();
        io.close();
        process.exit(0);
    });
});
//# sourceMappingURL=server.js.map