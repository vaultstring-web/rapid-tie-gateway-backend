"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tickets_controller_1 = require("../controllers/tickets.controller");
const ticketPurchases_controller_1 = require("../controllers/ticketPurchases.controller");
const ticketCheckIn_controller_1 = require("../controllers/ticketCheckIn.controller");
const router = (0, express_1.Router)();
router.get('/test', (_req, res) => {
    res.json({ message: 'Event route working!' });
});
router.get('/:id/tiers', tickets_controller_1.getEventTiers);
router.post('/tickets/validate', tickets_controller_1.validateTickets);
router.post('/:id/purchase', ticketPurchases_controller_1.purchaseTickets);
router.post('/checkin', ticketCheckIn_controller_1.checkInTicket);
router.post('/checkin/batch', ticketCheckIn_controller_1.batchCheckIn);
router.get('/checkin/stats/:eventId', ticketCheckIn_controller_1.getCheckInStats);
exports.default = router;
//# sourceMappingURL=event.routes.js.map