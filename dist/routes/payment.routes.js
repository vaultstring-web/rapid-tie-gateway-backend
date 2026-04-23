"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const router = (0, express_1.Router)();
router.get('/test', (_req, res) => {
    res.json({ message: 'Payment route working!' });
});
router.post('/initiate', payment_controller_1.initiatePayment);
router.post('/webhook/:provider', payment_controller_1.handlePaymentWebhook);
router.get('/status/:sessionToken', payment_controller_1.getPaymentStatus);
exports.default = router;
//# sourceMappingURL=payment.routes.js.map