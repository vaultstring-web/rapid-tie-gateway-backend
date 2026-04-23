"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const calendar_controller_1 = require("../controllers/calendar.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', calendar_controller_1.getUserCalendar);
router.get('/export', calendar_controller_1.exportCalendar);
router.get('/reminders', calendar_controller_1.sendEventReminders);
router.delete('/cache', calendar_controller_1.clearCalendarCache);
exports.default = router;
//# sourceMappingURL=calendar.routes.js.map