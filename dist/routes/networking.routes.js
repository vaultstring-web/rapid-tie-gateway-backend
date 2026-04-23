"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const networking_controller_1 = require("../controllers/networking.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/networking', networking_controller_1.getNetworkingSuggestions);
router.post('/networking/profile', networking_controller_1.updateNetworkingProfile);
router.post('/networking/connect', networking_controller_1.sendConnectionRequest);
router.post('/networking/respond', networking_controller_1.respondToConnection);
router.post('/networking/messages', networking_controller_1.sendMessage);
router.get('/networking/messages', networking_controller_1.getMessages);
router.get('/networking/connections', networking_controller_1.getConnections);
exports.default = router;
//# sourceMappingURL=networking.routes.js.map