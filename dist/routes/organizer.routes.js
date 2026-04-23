"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const organizer_controller_1 = require("../controllers/organizer.controller");
const auth_1 = require("../middlewares/auth");
const ticketTier_controller_1 = require("../controllers/ticketTier.controller");
const router = express_1.default.Router();
const oc = new organizer_controller_1.OrganizerController();
router.use(auth_1.authenticate, (0, auth_1.authorize)('ORGANIZER'));
router.get('/dashboard', (req, res, next) => oc.getDashboard(req, res, next));
router.get('/events', (req, res, next) => oc.getEvents(req, res, next));
router.post('/events', (req, res, next) => oc.createEvent(req, res, next));
router.get('/events/:id', (req, res, next) => oc.getEvent(req, res, next));
router.put('/events/:id', (req, res, next) => oc.updateEvent(req, res, next));
router.delete('/events/:id', (req, res, next) => oc.deleteEvent(req, res, next));
router.get('/profile', (req, res, next) => oc.getProfile(req, res, next));
router.put('/profile', (req, res, next) => oc.updateProfile(req, res, next));
router.post("/events/:id/tiers", ticketTier_controller_1.createTicketTier);
exports.default = router;
//# sourceMappingURL=organizer.routes.js.map