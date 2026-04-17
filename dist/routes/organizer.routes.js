"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizer_controller_1 = require("../controllers/organizer.controller");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const organizerController = new organizer_controller_1.OrganizerController();
router.get('/events', auth_1.authenticate, (0, auth_1.authorize)('ORGANIZER'), (req, res, next) => organizerController.getDashboard(req, res, next));
router.post('/events', auth_1.authenticate, (0, auth_1.authorize)('ORGANIZER'), (req, res, next) => organizerController.createEvent(req, res, next));
router.put('/events/:id', auth_1.authenticate, (0, auth_1.authorize)('ORGANIZER'), (req, res, next) => organizerController.updateEvent(req, res, next));
exports.default = router;
//# sourceMappingURL=organizer.routes.js.map