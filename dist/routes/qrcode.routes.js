"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const qrcode_controller_1 = require("../controllers/qrcode.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.post('/qrcodes/regenerate/:eventId', qrcode_controller_1.regenerateEventQRCodes);
router.post('/qrcodes/regenerate/ticket/:ticketId', qrcode_controller_1.regenerateTicketQRCode);
router.post('/qrcodes/role-specific/:eventId', qrcode_controller_1.generateRoleSpecificQRCodes);
router.get('/qrcodes/delivery-status/:eventId', qrcode_controller_1.getDeliveryStatus);
router.post('/qrcodes/bulk-email/:eventId', qrcode_controller_1.queueBulkEmails);
exports.default = router;
//# sourceMappingURL=qrcode.routes.js.map