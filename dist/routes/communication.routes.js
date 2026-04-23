"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const communication_controller_1 = require("../controllers/communication.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.post('/communications/:eventId', communication_controller_1.sendBulkMessage);
router.get('/communications/:communicationId/status', communication_controller_1.getCommunicationStatus);
router.get('/communications/event/:eventId', communication_controller_1.getEventCommunications);
router.get('/communications/track/open/:recipientId', communication_controller_1.trackOpen);
router.get('/communications/track/click/:recipientId/:url', communication_controller_1.trackClick);
router.post('/communications/opt-out', communication_controller_1.optOut);
exports.default = router;
//# sourceMappingURL=communication.routes.js.map