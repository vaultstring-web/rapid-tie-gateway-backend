"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_controller_1 = require("../controllers/sales.controller");
const router = (0, express_1.Router)();
router.get('/events/:id/sales', sales_controller_1.getEventSales);
router.get('/events/:id/sales/by-role', sales_controller_1.getSalesByCustomerRole);
exports.default = router;
//# sourceMappingURL=sale.routes.js.map