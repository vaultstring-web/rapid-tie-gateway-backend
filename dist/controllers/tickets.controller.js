"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventTiers = exports.validateTickets = void 0;
const tickets_service_1 = require("../services/tickets.service");
const server_1 = require("../server");
const validateTickets = async (req, res, next) => {
    try {
        const { tierId, quantity, purchaserRole } = req.body;
        const data = await (0, tickets_service_1.validateTicketsService)(tierId, quantity, purchaserRole);
        res.status(200).json({
            status: "success",
            data
        });
    }
    catch (error) {
        next(error);
    }
};
exports.validateTickets = validateTickets;
const getEventTiers = async (req, res, next) => {
    try {
        const { id: eventId } = req.params;
        const event = await server_1.prisma.event.findUnique({
            where: { id: eventId },
            include: {
                ticketTiers: {
                    orderBy: {
                        price: 'asc'
                    }
                },
                organizer: {
                    select: {
                        organizationName: true
                    }
                }
            }
        });
        if (!event) {
            res.status(404).json({
                success: false,
                message: "Event not found"
            });
            return;
        }
        const tiersWithAvailability = event.ticketTiers.map(tier => ({
            id: tier.id,
            name: tier.name,
            description: tier.description,
            price: tier.price,
            quantity: tier.quantity,
            sold: tier.sold,
            available: tier.quantity - tier.sold,
            isAvailable: (tier.quantity - tier.sold) > 0,
            maxPerCustomer: tier.maxPerCustomer,
            startSale: tier.startSale,
            endSale: tier.endSale
        }));
        res.status(200).json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    name: event.name,
                    description: event.description,
                    shortDescription: event.shortDescription,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    venue: event.venue,
                    city: event.city,
                    coverImage: event.coverImage,
                    organizer: event.organizer
                },
                tiers: tiersWithAvailability
            }
        });
        return;
    }
    catch (error) {
        next(error);
    }
};
exports.getEventTiers = getEventTiers;
//# sourceMappingURL=tickets.controller.js.map