"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalesByCustomerRole = exports.getEventSales = void 0;
const server_1 = require("../server");
const getEventSales = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const event = await server_1.prisma.event.findUnique({
            where: { id: eventId },
            include: {
                organizer: true,
                ticketTiers: true
            }
        });
        if (!event) {
            res.status(404).json({
                success: false,
                message: 'Event not found'
            });
            return;
        }
        const sales = await server_1.prisma.ticketSale.findMany({
            where: { eventId: eventId },
            include: {
                tickets: {
                    include: {
                        tier: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        const salesByTier = event.ticketTiers.map(tier => {
            const tierSales = sales.filter(sale => sale.tickets.some(ticket => ticket.tierId === tier.id));
            const revenue = tierSales.reduce((sum, sale) => sum + (sale.tickets.filter(t => t.tierId === tier.id).length * tier.price), 0);
            return {
                tierId: tier.id,
                tierName: tier.name,
                price: tier.price,
                totalQuantity: tier.quantity,
                sold: tier.sold,
                available: tier.quantity - tier.sold,
                revenue: revenue,
                percentageSold: ((tier.sold / tier.quantity) * 100).toFixed(2)
            };
        });
        const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const totalTicketsSold = sales.reduce((sum, sale) => sum + sale.tickets.length, 0);
        const totalFees = sales.reduce((sum, sale) => sum + sale.feeAmount, 0);
        const netRevenue = sales.reduce((sum, sale) => sum + sale.netAmount, 0);
        const capacityUtilization = event.capacity
            ? `${((totalTicketsSold / event.capacity) * 100).toFixed(1)}%`
            : 'N/A';
        const recentTransactions = await server_1.prisma.transaction.findMany({
            where: { organizerId: event.organizerId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                organizer: true
            }
        });
        res.status(200).json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    name: event.name,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    venue: event.venue,
                    city: event.city,
                    status: event.status
                },
                summary: {
                    totalRevenue,
                    totalTicketsSold,
                    totalFees,
                    netRevenue,
                    totalOrders: sales.length,
                    capacityUtilization
                },
                salesByTier,
                recentTransactions: recentTransactions.map(t => ({
                    id: t.id,
                    amount: t.amount,
                    status: t.status,
                    paymentMethod: t.paymentMethod,
                    createdAt: t.createdAt
                }))
            }
        });
        return;
    }
    catch (error) {
        console.error('Sales dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sales data'
        });
        return;
    }
};
exports.getEventSales = getEventSales;
const getSalesByCustomerRole = async (req, res) => {
    try {
        const { id: eventId } = req.params;
        res.status(200).json({
            success: true,
            data: {
                eventId: eventId,
                roles: {
                    PUBLIC: { ticketsSold: 0, revenue: 0, percentage: 0 },
                    MERCHANT: { ticketsSold: 0, revenue: 0, percentage: 0 },
                    ORGANIZER: { ticketsSold: 0, revenue: 0, percentage: 0 },
                    EMPLOYEE: { ticketsSold: 0, revenue: 0, percentage: 0 }
                },
                message: "Track customer roles by adding 'customerRole' field to TicketSale model"
            }
        });
        return;
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role-based sales'
        });
        return;
    }
};
exports.getSalesByCustomerRole = getSalesByCustomerRole;
//# sourceMappingURL=sales.controller.js.map