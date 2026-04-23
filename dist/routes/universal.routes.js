"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const universal_controller_1 = require("../controllers/universal.controller");
const router = (0, express_1.Router)();
router.get('/universal', universal_controller_1.getUniversalEvents);
router.get('/universal/trending', universal_controller_1.getTrendingEvents);
router.delete('/universal/cache', universal_controller_1.clearUniversalCache);
exports.default = router;
//# sourceMappingURL=universal.routes.js.map