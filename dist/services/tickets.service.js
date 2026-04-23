"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTicketsService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const server_1 = require("../server");
const inventoryLock_1 = require("../utils/inventoryLock");
const validateTicketsService = async (tierId, quantity, purchaserRole) => {
    const tier = await server_1.prisma.ticketTier.findUnique({
        where: { id: tierId },
        include: { event: true }
    });
    if (!tier) {
        throw new Error("Ticket tier not found");
    }
    const available = tier.quantity - tier.sold;
    if (quantity > available) {
        throw new Error("Not enough tickets available");
    }
    const sessionToken = crypto_1.default.randomBytes(16).toString("hex");
    (0, inventoryLock_1.createLock)(sessionToken, {
        tierId,
        quantity,
        purchaserRole,
        expiresAt: Date.now() + 15 * 60 * 1000
    });
    const subtotal = tier.price * quantity;
    const fee = subtotal * 0.05;
    const total = subtotal + fee;
    return {
        sessionToken,
        expiresIn: "15 minutes",
        tier: tier.name,
        quantity,
        subtotal,
        fee,
        total,
        purchaserRole
    };
};
exports.validateTicketsService = validateTicketsService;
//# sourceMappingURL=tickets.service.js.map