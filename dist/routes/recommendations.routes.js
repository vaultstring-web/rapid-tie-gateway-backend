"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recommendations_controller_1 = require("../controllers/recommendations.controller");
const router = (0, express_1.Router)();
router.get('/recommended', recommendations_controller_1.getRecommendedEvents);
router.delete('/recommended/cache', recommendations_controller_1.clearRecommendationsCache);
exports.default = router;
//# sourceMappingURL=recommendations.routes.js.map