"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("../server");
const errorHandler_1 = require("../utils/errorHandler");
const authenticate = async (req, _res, next) => {
    try {
        const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const user = await server_1.prisma.user.findUnique({
            where: { id: decoded.id },
            include: {
                merchant: true,
                organizer: true,
                employee: true,
                approver: true,
                financeOfficer: true,
                admin: true,
            },
        });
        if (!user) {
            return next(new errorHandler_1.AppError('User not found', 401));
        }
        req.user = user;
        req.token = token;
        next();
    }
    catch (error) {
        next(new errorHandler_1.AppError('Invalid or expired token', 401));
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        const userRole = req.user.role?.toLowerCase?.() || req.user.role;
        const hasRole = roles.some(role => role.toLowerCase() === userRole?.toLowerCase?.() || role === userRole);
        if (!hasRole) {
            return next(new errorHandler_1.AppError('Insufficient permissions', 403));
        }
        next();
    };
};
exports.authorize = authorize;
//# sourceMappingURL=auth.js.map