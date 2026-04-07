"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/test', (_req, res) => {
    res.json({ message: 'Payment route working!' });
});
exports.default = router;
//# sourceMappingURL=payment.routes.js.map