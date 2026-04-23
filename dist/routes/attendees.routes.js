"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendees_controller_1 = require("../controllers/attendees.controller");
const router = (0, express_1.Router)();
router.get('/events/:id/attendees', attendees_controller_1.getAttendees);
router.get('/events/:id/attendees/export', attendees_controller_1.exportAttendeesCSV);
router.get('/events/:id/attendees/stats', attendees_controller_1.getAttendeeStats);
exports.default = router;
//# sourceMappingURL=attendees.routes.js.map