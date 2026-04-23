"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const router = (0, express_1.Router)();
router.get('/:id', order_controller_1.getOrderConfirmation);
router.post('/:id/send-email', order_controller_1.sendOrderEmail);
router.post('/:id/update-inventory', order_controller_1.updateInventoryPermanently);
exports.default = router;
//# sourceMappingURL=order.routes.js.map