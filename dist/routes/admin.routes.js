"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/test', (_req, res) => {
    res.json({ message: 'Admin route working!' });
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map