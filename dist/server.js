"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.prisma = void 0;
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
dotenv_1.default.config();
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
const errorHandler_1 = require("./utils/errorHandler");
const notfound_1 = require("./middlewares/notfound");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    },
});
exports.io = io;
exports.prisma = new client_1.PrismaClient();
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
app.use('/api/events', event_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/webhooks', webhook_routes_1.default);
app.use('/api/organizer', organizer_routes_1.default);
app.use(notfound_1.notfound);
app.use(errorHandler_1.errorHandler);
io.on('connection', (socket) => {
    logger_1.logger.info(`Client connected: ${socket.id}`);
    socket.on('authenticate', (token) => {
        socket.join(`user-${token}`);
    });
    socket.on('disconnect', () => {
        logger_1.logger.info(`Client disconnected: ${socket.id}`);
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    logger_1.logger.info(`
  ╔════════════════════════════════════════════╗
  ║     Rapid Tie Payment Gateway              ║
  ║     Server is running on port ${PORT}        ║
  ║     Environment: ${process.env.NODE_ENV}                 ║
  ║     Frontend: ${process.env.FRONTEND_URL}   ║
  ╚════════════════════════════════════════════╝
  `);
});
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        logger_1.logger.info('HTTP server closed');
        exports.prisma.$disconnect();
        process.exit(0);
    });
});
//# sourceMappingURL=server.js.map