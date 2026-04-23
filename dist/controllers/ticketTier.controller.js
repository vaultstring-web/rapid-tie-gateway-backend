"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTicketTier = void 0;
const server_1 = require("../server");
const createTicketTier = async (req, res, next) => {
    try {
        const { id: eventId } = req.params;
        const { name, description, price, quantity, maxPerCustomer, startSale, endSale, rolePricing } = req.body;
        const tier = await server_1.prisma.ticketTier.create({
            data: {
                eventId,
                name,
                description,
                price,
                quantity,
                maxPerCustomer,
                startSale: startSale ? new Date(startSale) : null,
                endSale: endSale ? new Date(endSale) : null,
                rolePricing
            }
        });
        res.status(201).json({
            success: true,
            data: tier
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createTicketTier = createTicketTier;
//# sourceMappingURL=ticketTier.controller.js.map