"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.post('/test', (_req, res) => {
    res.json({ message: 'Webhook route working!' });
});
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map